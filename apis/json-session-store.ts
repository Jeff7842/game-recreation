import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import type { GameSession, PlayerColor } from "@/lib/checkers";

const SESSION_STORE_SEED_PATH = join(process.cwd(), "data", "sessions.json");

function getRuntimeSessionStorePath(): string {
  if (process.env.VERCEL) {
    return join(tmpdir(), "game-recreation", ".sessions.runtime.json");
  }

  return join(process.cwd(), "data", ".sessions.runtime.json");
}

const SESSION_STORE_RUNTIME_PATH = getRuntimeSessionStorePath();
const SESSION_STORE_DIRECTORY = dirname(SESSION_STORE_RUNTIME_PATH);

type SessionStoreData = {
  sessions: StoredSessionRecord[];
};

export type SessionStatus = "waiting" | "active" | "finished";

export type SessionResult = {
  loserColor: PlayerColor | null;
  loserName: string | null;
  winnerColor: PlayerColor | null;
  winnerName: string | null;
};

export type StoredSessionRecord = {
  createdAt: string;
  game: GameSession;
  id: string;
  result: SessionResult;
  status: SessionStatus;
  updatedAt: string;
};

let mutationQueue: Promise<unknown> = Promise.resolve();

function isMissingFileError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function normalizeGameId(gameId: string): string {
  return gameId.trim().toUpperCase();
}

function cloneGame(game: GameSession): GameSession {
  return {
    ...game,
    board: game.board.map((row) => [...row]),
    players: { ...game.players },
    score: { ...game.score },
  };
}

function cloneSessionRecord(record: StoredSessionRecord): StoredSessionRecord {
  return {
    ...record,
    game: cloneGame(record.game),
    result: { ...record.result },
  };
}

function createEmptySessionStore(): SessionStoreData {
  return {
    sessions: [],
  };
}

function parseSessionStore(rawFileContents: string): SessionStoreData {
  if (!rawFileContents.trim()) {
    return createEmptySessionStore();
  }

  const parsedValue = JSON.parse(rawFileContents) as Partial<SessionStoreData>;

  if (!parsedValue || typeof parsedValue !== "object") {
    return createEmptySessionStore();
  }

  if (!Array.isArray(parsedValue.sessions)) {
    return createEmptySessionStore();
  }

  return {
    sessions: parsedValue.sessions as StoredSessionRecord[],
  };
}

async function writeSessionStore(store: SessionStoreData): Promise<void> {
  await mkdir(SESSION_STORE_DIRECTORY, { recursive: true });

  const serializedStore = `${JSON.stringify(store, null, 2)}\n`;
  const temporaryPath = `${SESSION_STORE_RUNTIME_PATH}.tmp`;

  await writeFile(temporaryPath, serializedStore, "utf8");
  await rename(temporaryPath, SESSION_STORE_RUNTIME_PATH);
}

async function readSeedSessionStore(): Promise<SessionStoreData> {
  try {
    const rawSeedContents = await readFile(SESSION_STORE_SEED_PATH, "utf8");
    return parseSessionStore(rawSeedContents);
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }

    return createEmptySessionStore();
  }
}

async function ensureSessionStoreExists(): Promise<void> {
  await mkdir(SESSION_STORE_DIRECTORY, { recursive: true });

  try {
    await readFile(SESSION_STORE_RUNTIME_PATH, "utf8");
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }

    await writeSessionStore(await readSeedSessionStore());
  }
}

async function readSessionStore(): Promise<SessionStoreData> {
  await ensureSessionStoreExists();

  const rawFileContents = await readFile(SESSION_STORE_RUNTIME_PATH, "utf8");
  return parseSessionStore(rawFileContents);
}

async function waitForPendingMutations(): Promise<void> {
  await mutationQueue.catch(() => undefined);
}

function withSessionStoreMutation<T>(
  mutator: (store: SessionStoreData) => Promise<T> | T,
): Promise<T> {
  const operation = mutationQueue.then(async () => {
    const store = await readSessionStore();
    const result = await mutator(store);
    await writeSessionStore(store);
    return result;
  });

  mutationQueue = operation.catch(() => undefined);

  return operation;
}

function deriveSessionStatus(game: GameSession): SessionStatus {
  if (game.winner) {
    return "finished";
  }

  return game.players.b ? "active" : "waiting";
}

function deriveSessionResult(game: GameSession): SessionResult {
  const winnerColor = game.winner;
  const loserColor = winnerColor ? (winnerColor === "r" ? "b" : "r") : null;

  return {
    winnerColor,
    winnerName: winnerColor ? game.players[winnerColor] : null,
    loserColor,
    loserName: loserColor ? game.players[loserColor] : null,
  };
}

export async function listStoredSessions(): Promise<StoredSessionRecord[]> {
  await waitForPendingMutations();

  const store = await readSessionStore();

  return [...store.sessions]
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
    .map(cloneSessionRecord);
}

export async function findStoredSessionById(
  gameId: string,
): Promise<StoredSessionRecord | null> {
  await waitForPendingMutations();

  const normalizedGameId = normalizeGameId(gameId);
  const store = await readSessionStore();
  const foundSession = store.sessions.find((session) => session.id === normalizedGameId);

  return foundSession ? cloneSessionRecord(foundSession) : null;
}

export async function hasStoredSessionId(gameId: string): Promise<boolean> {
  await waitForPendingMutations();

  const normalizedGameId = normalizeGameId(gameId);
  const store = await readSessionStore();

  return store.sessions.some((session) => session.id === normalizedGameId);
}

export async function persistStoredSession(
  game: GameSession,
): Promise<StoredSessionRecord> {
  return withSessionStoreMutation((store) => {
    const normalizedGame = cloneGame(game);
    normalizedGame.id = normalizeGameId(normalizedGame.id);

    const now = new Date().toISOString();
    const existingSessionIndex = store.sessions.findIndex(
      (session) => session.id === normalizedGame.id,
    );
    const existingSession =
      existingSessionIndex >= 0 ? store.sessions[existingSessionIndex] : null;

    const storedSession: StoredSessionRecord = {
      id: normalizedGame.id,
      game: normalizedGame,
      status: deriveSessionStatus(normalizedGame),
      result: deriveSessionResult(normalizedGame),
      createdAt: existingSession?.createdAt ?? now,
      updatedAt: now,
    };

    if (existingSessionIndex >= 0) {
      store.sessions[existingSessionIndex] = storedSession;
    } else {
      store.sessions.push(storedSession);
    }

    return cloneSessionRecord(storedSession);
  });
}
