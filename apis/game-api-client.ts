import type { GameSession, PlayerColor } from "@/lib/checkers";

type CreateGameBody = {
  action: "create";
  playerName: string;
};

type JoinGameBody = {
  action: "join";
  gameId: string;
  playerName: string;
};

type MoveBody = {
  action: "move";
  fromX: number;
  fromY: number;
  gameId: string;
  playerColor: PlayerColor;
  toX: number;
  toY: number;
};

type GameRequestBody = CreateGameBody | JoinGameBody | MoveBody;

type MoveInput = {
  fromX: number;
  fromY: number;
  gameId: string;
  playerColor: PlayerColor;
  toX: number;
  toY: number;
};

export class GameApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GameApiError";
    this.status = status;
  }
}

function logGameApiClient(message: string, details?: Record<string, unknown>): void {
  console.log(`[game-api-client] ${message}`, details ?? "");
}

function getBrowserOrigin(): string {
  const origin =
    typeof window === "undefined" ? "http://localhost" : window.location.origin;

  logGameApiClient("resolved browser origin", { origin });
  return origin;
}

function buildGameApiUrl(gameApiUrl: string, gameId?: string): string {
  const safeGameApiUrl = gameApiUrl.trim() || "/api/game";
  const url = new URL(safeGameApiUrl, getBrowserOrigin());
  const safeGameId = gameId?.trim();

  if (safeGameId) {
    url.searchParams.set("id", safeGameId);
  }

  logGameApiClient("built game API URL", {
    gameId: safeGameId,
    url: url.toString(),
  });
  return url.toString();
}

function getErrorMessageFromPayload(payload: unknown): string | null {
  logGameApiClient("reading error message from payload");

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const maybePayload = payload as {
    error?: unknown;
  };

  if (typeof maybePayload.error === "string") {
    return maybePayload.error;
  }

  if (
    maybePayload.error &&
    typeof maybePayload.error === "object" &&
    "message" in maybePayload.error &&
    typeof (maybePayload.error as { message?: unknown }).message === "string"
  ) {
    return (maybePayload.error as { message: string }).message;
  }

  return null;
}

function hasGameId(payload: unknown): payload is GameSession {
  logGameApiClient("validating game response payload");

  return (
    !!payload &&
    typeof payload === "object" &&
    "id" in payload &&
    typeof (payload as { id?: unknown }).id === "string" &&
    (payload as { id: string }).id.trim().length > 0
  );
}

async function readGameResponse(response: Response): Promise<GameSession> {
  logGameApiClient("reading game response", { status: response.status });
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new GameApiError(
      getErrorMessageFromPayload(payload) ??
        "Something went wrong while talking to the game server.",
      response.status,
    );
  }

  if (!hasGameId(payload)) {
    throw new GameApiError("The game server did not send back a game id.", 502);
  }

  return payload;
}

async function postGame(
  gameApiUrl: string,
  body: GameRequestBody,
): Promise<GameSession> {
  logGameApiClient("posting game request", { action: body.action });
  const response = await fetch(buildGameApiUrl(gameApiUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return readGameResponse(response);
}

export function getGameFromServer(
  gameApiUrl: string,
  gameId: string,
): Promise<GameSession> {
  logGameApiClient("fetching game from server", { gameId });
  return fetch(buildGameApiUrl(gameApiUrl, gameId), {
    cache: "no-store",
  }).then(readGameResponse);
}

export function createGameOnServer(
  gameApiUrl: string,
  playerName: string,
): Promise<GameSession> {
  logGameApiClient("creating game on server", { hasPlayerName: Boolean(playerName) });
  return postGame(gameApiUrl, {
    action: "create",
    playerName,
  });
}

export function joinGameOnServer(
  gameApiUrl: string,
  gameId: string,
  playerName: string,
): Promise<GameSession> {
  logGameApiClient("joining game on server", {
    gameId,
    hasPlayerName: Boolean(playerName),
  });
  return postGame(gameApiUrl, {
    action: "join",
    gameId,
    playerName,
  });
}

export function movePieceOnServer(
  gameApiUrl: string,
  move: MoveInput,
): Promise<GameSession> {
  logGameApiClient("moving piece on server", {
    fromX: move.fromX,
    fromY: move.fromY,
    gameId: move.gameId,
    playerColor: move.playerColor,
    toX: move.toX,
    toY: move.toY,
  });
  return postGame(gameApiUrl, {
    action: "move",
    ...move,
  });
}

export function getGameApiErrorMessage(error: unknown): string {
  logGameApiClient("getting game API error message");
  return error instanceof Error ? error.message : "Something went wrong.";
}
