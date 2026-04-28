import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { GameSession, PlayerColor } from "@/lib/checkers";

const LOCAL_SESSION_STORE_PATH = join(process.cwd(), "data", "sessions.json");
const SESSION_STORE_PATH = process.env.VERCEL
  ? join(tmpdir(), "game-recreation", "sessions.json")
  : LOCAL_SESSION_STORE_PATH;
const SESSION_STORE_DIRECTORY = dirname(SESSION_STORE_PATH);

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

function logSessionStore(message: string, details?: Record<string, unknown>): void {
  console.log(`[session-store] ${message}`, details ?? "");
}

function isMissingFileError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function normalizeGameId(gameId: string): string {
  const normalizedGameId = gameId.trim().toUpperCase();
  logSessionStore("normalized game id", { gameId: normalizedGameId });
  return normalizedGameId;
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
  logSessionStore("created empty local session store");
  return {
    sessions: [],
  };
}

function parseSessionStore(rawFileContents: string): SessionStoreData {
  logSessionStore("parsing local session store");

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
  logSessionStore("writing local session store", {
    path: SESSION_STORE_PATH,
    sessions: store.sessions.length,
  });

  await mkdir(SESSION_STORE_DIRECTORY, { recursive: true });

  const serializedStore = `${JSON.stringify(store, null, 2)}\n`;
  const temporaryPath = `${SESSION_STORE_PATH}.tmp`;

  await writeFile(temporaryPath, serializedStore, "utf8");
  await rename(temporaryPath, SESSION_STORE_PATH);
}

async function createInitialSessionStore(): Promise<SessionStoreData> {
  if (!process.env.VERCEL) {
    return createEmptySessionStore();
  }

  try {
    return parseSessionStore(await readFile(LOCAL_SESSION_STORE_PATH, "utf8"));
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }

    return createEmptySessionStore();
  }
}

async function ensureSessionStoreExists(): Promise<void> {
  logSessionStore("ensuring local session store exists", {
    path: SESSION_STORE_PATH,
  });

  await mkdir(SESSION_STORE_DIRECTORY, { recursive: true });

  try {
    await readFile(SESSION_STORE_PATH, "utf8");
    logSessionStore("local session store found", {
      path: SESSION_STORE_PATH,
    });
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }

    logSessionStore("local session store missing, creating sessions.json");
    await writeSessionStore(await createInitialSessionStore());
  }
}

async function readSessionStore(): Promise<SessionStoreData> {
  logSessionStore("reading local session store", {
    path: SESSION_STORE_PATH,
  });

  await ensureSessionStoreExists();

  const rawFileContents = await readFile(SESSION_STORE_PATH, "utf8");
  return parseSessionStore(rawFileContents);
}

async function waitForPendingMutations(): Promise<void> {
  logSessionStore("waiting for pending local session mutations");
  await mutationQueue.catch(() => undefined);
}

function withSessionStoreMutation<T>(
  mutator: (store: SessionStoreData) => Promise<T> | T,
): Promise<T> {
  logSessionStore("queued local session store mutation");

  const operation = mutationQueue.then(async () => {
    logSessionStore("running local session store mutation");
    const store = await readSessionStore();
    const result = await mutator(store);
    await writeSessionStore(store);
    logSessionStore("completed local session store mutation");
    return result;
  });

  mutationQueue = operation.catch(() => undefined);

  return operation;
}

function deriveSessionStatus(game: GameSession): SessionStatus {
  logSessionStore("deriving session status from game state", { gameId: game.id });

  if (game.winner) {
    return "finished";
  }

  return game.players.b ? "active" : "waiting";
}

function deriveSessionResult(game: GameSession): SessionResult {
  const winnerColor = game.winner;
  const loserColor = winnerColor ? (winnerColor === "r" ? "b" : "r") : null;

  logSessionStore("deriving session result from game state", { gameId: game.id });

  return {
    winnerColor,
    winnerName: winnerColor ? game.players[winnerColor] : null,
    loserColor,
    loserName: loserColor ? game.players[loserColor] : null,
  };
}

export async function listStoredSessions(): Promise<StoredSessionRecord[]> {
  logSessionStore("listing stored sessions from local JSON");

  await waitForPendingMutations();

  const store = await readSessionStore();

  return [...store.sessions]
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
    .map(cloneSessionRecord);
}

export async function findStoredSessionById(
  gameId: string,
): Promise<StoredSessionRecord | null> {
  logSessionStore("finding stored session by ID", { gameId });

  await waitForPendingMutations();

  const normalizedGameId = normalizeGameId(gameId);
  const store = await readSessionStore();
  const foundSession = store.sessions.find((session) => session.id === normalizedGameId);

  return foundSession ? cloneSessionRecord(foundSession) : null;
}

export async function hasStoredSessionId(gameId: string): Promise<boolean> {
  logSessionStore("checking if stored session exists", { gameId });

  await waitForPendingMutations();

  const normalizedGameId = normalizeGameId(gameId);
  const store = await readSessionStore();

  return store.sessions.some((session) => session.id === normalizedGameId);
}

export async function persistStoredSession(
  game: GameSession,
): Promise<StoredSessionRecord> {
  logSessionStore("persisting stored session to local JSON", { gameId: game.id });

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
