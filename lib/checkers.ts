export const pieces = {
  r: "/checkers/red.png",
  b: "/checkers/black.png",
  R: "/checkers/red-king.png",
  B: "/checkers/black-king.png",
} as const;

export type PieceKey = keyof typeof pieces;
export type BoardCell = PieceKey | ".";
export type PlayerColor = "r" | "b";
export type Score = Record<PlayerColor, number>;
export type Board = BoardCell[][];

export type GameSession = {
  id: string;
  board: Board;
  players: {
    r: string;
    b: string | null;
  };
  turn: PlayerColor;
  score: Score;
  winner: PlayerColor | null;
};

type MoveResult =
  | { capture: false }
  | {
      capture: true;
      capturedColor: PlayerColor;
      midX: number;
      midY: number;
    };

export const initialBoard: Board = [
  [".", "r", ".", "r", ".", "r", ".", "r"],
  ["r", ".", "r", ".", "r", ".", "r", "."],
  [".", "r", ".", "r", ".", "r", ".", "r"],
  [".", ".", ".", ".", ".", ".", ".", "."],
  [".", ".", ".", ".", ".", ".", ".", "."],
  ["b", ".", "b", ".", "b", ".", "b", "."],
  [".", "b", ".", "b", ".", "b", ".", "b"],
  ["b", ".", "b", ".", "b", ".", "b", "."],
];

export function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

export function createInitialBoard(): Board {
  return cloneBoard(initialBoard);
}

export function getPieceColor(piece: BoardCell): PlayerColor | null {
  if (piece === ".") {
    return null;
  }

  return piece.toLowerCase() as PlayerColor;
}

export function getOpponentColor(color: PlayerColor): PlayerColor {
  return color === "r" ? "b" : "r";
}

function isInsideBoard(x: number, y: number): boolean {
  return x >= 0 && x < 8 && y >= 0 && y < 8;
}

export function getValidMove(
  board: Board,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): MoveResult | false {
  if (
    !isInsideBoard(fromX, fromY) ||
    !isInsideBoard(toX, toY) ||
    (fromX === toX && fromY === toY)
  ) {
    return false;
  }

  const piece = board[fromY]?.[fromX];
  const target = board[toY]?.[toX];

  if (!piece || piece === "." || !target || target !== ".") {
    return false;
  }

  const dx = toX - fromX;
  const dy = toY - fromY;
  const pieceColor = getPieceColor(piece);

  if (!pieceColor) {
    return false;
  }

  const isKing = piece === "R" || piece === "B";
  const direction = pieceColor === "r" ? 1 : -1;

  if (Math.abs(dx) === 1 && (isKing || dy === direction)) {
    return { capture: false };
  }

  if (Math.abs(dx) === 2 && (isKing || dy === 2 * direction)) {
    const midX = fromX + dx / 2;
    const midY = fromY + dy / 2;
    const middlePiece = board[midY]?.[midX];
    const middleColor = middlePiece ? getPieceColor(middlePiece) : null;

    if (middleColor && middleColor !== pieceColor) {
      return {
        capture: true,
        capturedColor: middleColor,
        midX,
        midY,
      };
    }
  }

  return false;
}

export function applyMove(
  board: Board,
  score: Score,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): {
  board: Board;
  score: Score;
  turn: PlayerColor;
  winner: PlayerColor | null;
} | null {
  const move = getValidMove(board, fromX, fromY, toX, toY);

  if (!move) {
    return null;
  }

  const nextBoard = cloneBoard(board);
  const movingPiece = nextBoard[fromY][fromX];
  const movingColor = getPieceColor(movingPiece);

  if (!movingColor) {
    return null;
  }

  nextBoard[toY][toX] = movingPiece;
  nextBoard[fromY][fromX] = ".";

  const nextScore: Score = { ...score };
  let winner: PlayerColor | null = null;

  if (move.capture) {
    nextBoard[move.midY][move.midX] = ".";
    nextScore[move.capturedColor] = Math.max(
      0,
      nextScore[move.capturedColor] - 1,
    );

    if (nextScore[move.capturedColor] === 0) {
      winner = movingColor;
    }
  }

  if (movingPiece === "r" && toY === 7) {
    nextBoard[toY][toX] = "R";
  }

  if (movingPiece === "b" && toY === 0) {
    nextBoard[toY][toX] = "B";
  }

  return {
    board: nextBoard,
    score: nextScore,
    turn: getOpponentColor(movingColor),
    winner,
  };
}

export function generateGameId(existingIds: { has(id: string): boolean }): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "CHK-";

  do {
    id = "CHK-";

    for (let index = 0; index < 8; index += 1) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (existingIds.has(id));

  return id;
}

export function serializeBoard(board: Board): string {
  return board.map((row) => row.join("")).join("|");
}
