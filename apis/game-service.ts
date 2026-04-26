import {
  applyMove,
  createInitialBoard,
  generateGameId,
  getPieceColor,
  type GameSession,
  type PlayerColor,
} from "@/lib/checkers";

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

type GameStore = Map<string, GameSession>;

declare global {
  var __checkersGameStore: GameStore | undefined;
}

const gameStore: GameStore = globalThis.__checkersGameStore ?? new Map();

if (!globalThis.__checkersGameStore) {
  globalThis.__checkersGameStore = gameStore;
}

function cloneGame(game: GameSession): GameSession {
  return {
    ...game,
    board: game.board.map((row) => [...row]),
    players: { ...game.players },
    score: { ...game.score },
  };
}

function normalizePlayerName(playerName: string): string {
  const normalized = playerName.trim();

  if (!normalized) {
    throw new GameServiceError("Player name is required.", 400);
  }

  return normalized;
}

function normalizeGameId(gameId: string): string {
  const normalized = gameId.trim().toUpperCase();

  if (!normalized) {
    throw new GameServiceError("Game id is required.", 400);
  }

  return normalized;
}

function getStoredGame(gameId: string): GameSession {
  const game = gameStore.get(normalizeGameId(gameId));

  if (!game) {
    throw new GameServiceError("Game not found.", 404);
  }

  return game;
}

function saveGame(game: GameSession): GameSession {
  const snapshot = cloneGame(game);
  gameStore.set(snapshot.id, snapshot);
  return cloneGame(snapshot);
}

export function createGame(playerName: string): GameSession {
  const redPlayer = normalizePlayerName(playerName);
  const id = generateGameId(gameStore);

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

export function getGame(gameId: string): GameSession {
  return cloneGame(getStoredGame(gameId));
}

export function joinGame(gameId: string, playerName: string): GameSession {
  const game = getStoredGame(gameId);
  const blackPlayer = normalizePlayerName(playerName);

  if (game.players.b && game.players.b !== blackPlayer) {
    throw new GameServiceError("This game already has two players.", 409);
  }

  game.players.b = blackPlayer;
  return saveGame(game);
}

export function submitMove(gameId: string, move: MoveInput): GameSession {
  const game = getStoredGame(gameId);

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
    throw new GameServiceError("Invalid move.", 409);
  }

  game.board = nextState.board;
  game.score = nextState.score;
  game.turn = nextState.turn;
  game.winner = nextState.winner;

  return saveGame(game);
}
