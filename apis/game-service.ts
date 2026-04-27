import {
  applyMove,
  createInitialBoard,
  getPieceColor,
  type GameSession,
  type PlayerColor,
} from "@/lib/checkers";

import {
  findStoredSessionById,
  hasStoredSessionId,
  persistStoredSession,
} from "@/apis/json-session-store";

export class GameServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "GameServiceError";
    this.status = status;
  }
}

type MoveInput = {
  fromX: number;
  fromY: number;
  playerColor: PlayerColor;
  toX: number;
  toY: number;
};

function logGameService(message: string, details?: Record<string, unknown>): void {
  console.log(`[game-service] ${message}`, details ?? "");
}

function cloneGame(game: GameSession): GameSession {
  return {
    ...game,
    board: game.board.map((row) => [...row]),
    players: { ...game.players },
    score: { ...game.score },
  };
}

const GAME_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const GAME_ID_LENGTH = 8;
const MAX_GAME_ID_ATTEMPTS = 20;

function createRandomGameId(): string {
  let id = "CHK-";

  for (let index = 0; index < GAME_ID_LENGTH; index += 1) {
    id += GAME_ID_CHARS[Math.floor(Math.random() * GAME_ID_CHARS.length)];
  }

  logGameService("created random game id", { gameId: id });
  return id;
}

async function generateUniqueGameId(): Promise<string> {
  logGameService("generating unique game id");

  for (let attempt = 0; attempt < MAX_GAME_ID_ATTEMPTS; attempt += 1) {
    const gameId = createRandomGameId();

    if (!(await hasStoredSessionId(gameId))) {
      logGameService("unique game id accepted", { attempt: attempt + 1, gameId });
      return gameId;
    }

    logGameService("game id collision found", { attempt: attempt + 1, gameId });
  }

  throw new GameServiceError(
    "Could not create a unique game id right now. Please try again.",
    503,
  );
}

function normalizePlayerName(playerName: string): string {
  const normalized = playerName.trim();
  logGameService("normalized player name", {
    hasPlayerName: Boolean(normalized),
  });

  if (!normalized) {
    throw new GameServiceError("Player name is required.", 400);
  }

  return normalized;
}

function normalizeGameId(gameId: string): string {
  const normalized = gameId.trim().toUpperCase();
  logGameService("normalized game id", { gameId: normalized });

  if (!normalized) {
    throw new GameServiceError("Game id is required.", 400);
  }

  return normalized;
}

async function getStoredGame(gameId: string): Promise<GameSession> {
  const normalizedGameId = normalizeGameId(gameId);
  logGameService("loading stored game", { gameId: normalizedGameId });

  const storedSession = await findStoredSessionById(normalizedGameId);

  if (!storedSession) {
    throw new GameServiceError("Game not found.", 404);
  }

  return cloneGame(storedSession.game);
}

async function saveGame(game: GameSession): Promise<GameSession> {
  logGameService("saving game", {
    gameId: game.id,
    turn: game.turn,
    winner: game.winner,
  });
  const storedSession = await persistStoredSession(game);
  return cloneGame(storedSession.game);
}

export async function createGame(playerName: string): Promise<GameSession> {
  logGameService("creating game");
  const redPlayer = normalizePlayerName(playerName);
  const id = await generateUniqueGameId();

  return saveGame({
    id,
    board: createInitialBoard(),
    players: {
      r: redPlayer,
      b: null,
    },
    turn: "r",
    score: {
      r: 12,
      b: 12,
    },
    winner: null,
  });
}

export function getGame(gameId: string): Promise<GameSession> {
  logGameService("getting game", { gameId });
  return getStoredGame(gameId);
}

export async function joinGame(
  gameId: string,
  playerName: string,
): Promise<GameSession> {
  logGameService("joining game", { gameId });
  const game = await getStoredGame(gameId);
  const blackPlayer = normalizePlayerName(playerName);

  if (game.players.b && game.players.b !== blackPlayer) {
    throw new GameServiceError("This game already has two players.", 409);
  }

  game.players.b = blackPlayer;
  return saveGame(game);
}

export async function submitMove(
  gameId: string,
  move: MoveInput,
): Promise<GameSession> {
  logGameService("submitting move", {
    fromX: move.fromX,
    fromY: move.fromY,
    gameId,
    playerColor: move.playerColor,
    toX: move.toX,
    toY: move.toY,
  });
  const game = await getStoredGame(gameId);

  if (!game.players.b) {
    throw new GameServiceError("Wait for the second player to join first.", 409);
  }

  if (game.winner) {
    throw new GameServiceError("This game is already finished.", 409);
  }

  if (game.turn !== move.playerColor) {
    throw new GameServiceError("It is not your turn.", 409);
  }

  if (!game.players[move.playerColor]) {
    throw new GameServiceError("Player is not part of this game.", 403);
  }

  const movingPiece = game.board[move.fromY]?.[move.fromX];

  if (!movingPiece || getPieceColor(movingPiece) !== move.playerColor) {
    throw new GameServiceError("You can only move your own pieces.", 409);
  }

  const nextState = applyMove(
    game.board,
    game.score,
    move.fromX,
    move.fromY,
    move.toX,
    move.toY,
  );

  if (!nextState) {
    logGameService("move rejected by checker rules", { gameId });
    throw new GameServiceError("Invalid move.", 409);
  }

  game.board = nextState.board;
  game.score = nextState.score;
  game.turn = nextState.turn;
  game.winner = nextState.winner;

  logGameService("move applied", {
    gameId: game.id,
    nextTurn: game.turn,
    winner: game.winner,
  });
  return saveGame(game);
}
