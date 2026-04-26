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
const SESSION_STORE_NAMESPACE =
  process.env.SESSION_STORE_NAMESPACE?.trim() || "game-recreation";
const SESSION_STORE_INDEX_KEY = `${SESSION_STORE_NAMESPACE}:sessions:index`;
const SESSION_STORE_RECORD_PREFIX = `${SESSION_STORE_NAMESPACE}:session:`;

type SessionStoreData = {
  sessions: StoredSessionRecord[];
};

type KvConfig = {
  restApiToken: string;
  restApiUrl: string;
};

type KvCommandPart = number | string;

type KvCommandResponse<T> = {
  error?: string;
  result?: T;
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

function getKvConfig(): KvConfig | null {
  const restApiUrl =
    process.env.KV_REST_API_URL?.trim() ||
    process.env.UPSTASH_REDIS_REST_URL?.trim();
  const restApiToken =
    process.env.KV_REST_API_TOKEN?.trim() ||
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!restApiUrl || !restApiToken) {
    return null;
  }

  return {
    restApiToken,
    restApiUrl: restApiUrl.replace(/\/+$/, ""),
  };
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
  return gameId.trim().toUpperCase();
}

function getSessionRecordKey(gameId: string): string {
  return `${SESSION_STORE_RECORD_PREFIX}${normalizeGameId(gameId)}`;
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

function parseStoredSessionRecord(value: unknown): StoredSessionRecord | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(value) as Partial<StoredSessionRecord>;

    if (
      !parsedValue ||
      typeof parsedValue !== "object" ||
      typeof parsedValue.id !== "string" ||
      !parsedValue.game
    ) {
      return null;
    }

    return parsedValue as StoredSessionRecord;
  } catch {
    return null;
  }
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

async function runKvCommand<T>(command: KvCommandPart[]): Promise<T> {
  const kvConfig = getKvConfig();

  if (!kvConfig) {
    throw new Error("Session KV storage is not configured.");
  }

  const response = await fetch(kvConfig.restApiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kvConfig.restApiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | KvCommandResponse<T>
    | null;

  if (!response.ok || !payload || typeof payload !== "object") {
    throw new Error("Session KV storage request failed.");
  }

  if (typeof payload.error === "string") {
    throw new Error(`Session KV storage failed: ${payload.error}`);
  }

  return payload.result as T;
}

async function listKvStoredSessions(): Promise<StoredSessionRecord[]> {
  const sessionIds = await runKvCommand<string[]>([
    "ZREVRANGE",
    SESSION_STORE_INDEX_KEY,
    0,
    -1,
  ]);

  if (!Array.isArray(sessionIds)) {
    return [];
  }

  const sessions = await Promise.all(sessionIds.map(findKvStoredSessionById));

  return sessions
    .filter((session): session is StoredSessionRecord => Boolean(session))
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
    .map(cloneSessionRecord);
}

async function findKvStoredSessionById(
  gameId: string,
): Promise<StoredSessionRecord | null> {
  const rawSession = await runKvCommand<string | null>([
    "GET",
    getSessionRecordKey(gameId),
  ]);
  const storedSession = parseStoredSessionRecord(rawSession);

  return storedSession ? cloneSessionRecord(storedSession) : null;
}

async function hasKvStoredSessionId(gameId: string): Promise<boolean> {
  const exists = await runKvCommand<number>([
    "EXISTS",
    getSessionRecordKey(gameId),
  ]);

  return Number(exists) > 0;
}

async function persistKvStoredSession(
  game: GameSession,
): Promise<StoredSessionRecord> {
  const normalizedGame = cloneGame(game);
  normalizedGame.id = normalizeGameId(normalizedGame.id);

  const existingSession = await findKvStoredSessionById(normalizedGame.id);
  const now = new Date().toISOString();
  const storedSession: StoredSessionRecord = {
    id: normalizedGame.id,
    game: normalizedGame,
    status: deriveSessionStatus(normalizedGame),
    result: deriveSessionResult(normalizedGame),
    createdAt: existingSession?.createdAt ?? now,
    updatedAt: now,
  };

  await runKvCommand<string>([
    "SET",
    getSessionRecordKey(normalizedGame.id),
    JSON.stringify(storedSession),
  ]);
  await runKvCommand<number>([
    "ZADD",
    SESSION_STORE_INDEX_KEY,
    Date.parse(now),
    normalizedGame.id,
  ]);

  return cloneSessionRecord(storedSession);
}

export async function listStoredSessions(): Promise<StoredSessionRecord[]> {
  if (getKvConfig()) {
    return listKvStoredSessions();
  }

  await waitForPendingMutations();

  const store = await readSessionStore();

  return [...store.sessions]
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
    .map(cloneSessionRecord);
}

export async function findStoredSessionById(
  gameId: string,
): Promise<StoredSessionRecord | null> {
  if (getKvConfig()) {
    return findKvStoredSessionById(gameId);
  }

  await waitForPendingMutations();

  const normalizedGameId = normalizeGameId(gameId);
  const store = await readSessionStore();
  const foundSession = store.sessions.find((session) => session.id === normalizedGameId);

  return foundSession ? cloneSessionRecord(foundSession) : null;
}

export async function hasStoredSessionId(gameId: string): Promise<boolean> {
  if (getKvConfig()) {
    return hasKvStoredSessionId(gameId);
  }

  await waitForPendingMutations();

  const normalizedGameId = normalizeGameId(gameId);
  const store = await readSessionStore();

  return store.sessions.some((session) => session.id === normalizedGameId);
}

export async function persistStoredSession(
  game: GameSession,
): Promise<StoredSessionRecord> {
  if (getKvConfig()) {
    return persistKvStoredSession(game);
  }

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
