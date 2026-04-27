import type { NextRequest } from "next/server";

import {
  GameServiceError,
  createGame,
  getGame,
  joinGame,
  submitMove,
} from "@/apis/game-service";
import type { PlayerColor } from "@/lib/checkers";

type GameRequestBody =
  | {
      action: "create";
      playerName?: string;
    }
  | {
      action: "join";
      gameId?: string;
      playerName?: string;
    }
  | {
      action: "move";
      gameId?: string;
      fromX?: number;
      fromY?: number;
      playerColor?: PlayerColor;
      toX?: number;
      toY?: number;
    };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

function logGameApi(message: string, details?: Record<string, unknown>): void {
  console.log(`[game-api] ${message}`, details ?? "");
}

function withCors(init: ResponseInit = {}): ResponseInit {
  logGameApi("applying CORS headers", { status: init.status });
  const headers = new Headers(init.headers);

  Object.entries(corsHeaders).forEach(([name, value]) => {
    headers.set(name, value);
  });

  return {
    ...init,
    headers,
  };
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  logGameApi("sending JSON response", { status: init?.status ?? 200 });
  return Response.json(body, withCors(init));
}

function isPlayerColor(value: unknown): value is PlayerColor {
  return value === "r" || value === "b";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getErrorResponse(error: unknown): Response {
  if (error instanceof GameServiceError) {
    logGameApi("handled game service error", {
      message: error.message,
      status: error.status,
    });
    return jsonResponse({ error: error.message }, { status: error.status });
  }

  console.error("Game API failed:", error);

  return jsonResponse(
    { error: "Something went wrong while handling the game request." },
    { status: 500 },
  );
}

function getGameIdFromRequest(request: NextRequest): string | null {
  const gameId =
    request.nextUrl.searchParams.get("id") ??
    request.nextUrl.searchParams.get("gameId") ??
    request.headers.get("x-game-id");

  logGameApi("read game id from request", { gameId });
  return gameId?.trim() ? gameId : null;
}

export function OPTIONS() {
  logGameApi("OPTIONS request received");
  return new Response(null, withCors({ status: 204 }));
}

export async function GET(request: NextRequest) {
  try {
    logGameApi("GET request received");
    const gameId = getGameIdFromRequest(request);

    if (!gameId) {
      throw new GameServiceError(
        "Missing game id in the request. Send it like /api/game?id=CHK-XXXXXXXX.",
        400,
      );
    }

    logGameApi("GET game request accepted", { gameId });
    return jsonResponse(await getGame(gameId));
  } catch (error) {
    return getErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    logGameApi("POST request received");
    const body = (await request.json()) as GameRequestBody;
    logGameApi("POST body parsed", { action: body.action });

    switch (body.action) {
      case "create":
        if (typeof body.playerName !== "string") {
          throw new GameServiceError("Player name is required.", 400);
        }

        logGameApi("create action accepted");
        return jsonResponse(await createGame(body.playerName));

      case "join":
        if (typeof body.gameId !== "string") {
          throw new GameServiceError("Game id is required.", 400);
        }

        if (typeof body.playerName !== "string") {
          throw new GameServiceError("Player name is required.", 400);
        }

        logGameApi("join action accepted", { gameId: body.gameId });
        return jsonResponse(await joinGame(body.gameId, body.playerName));

      case "move":
        if (typeof body.gameId !== "string") {
          throw new GameServiceError("Game id is required.", 400);
        }

        if (!isPlayerColor(body.playerColor)) {
          throw new GameServiceError("Player color is required.", 400);
        }

        if (
          !isNumber(body.fromX) ||
          !isNumber(body.fromY) ||
          !isNumber(body.toX) ||
          !isNumber(body.toY)
        ) {
          throw new GameServiceError("Move coordinates are required.", 400);
        }

        logGameApi("move action accepted", {
          gameId: body.gameId,
          playerColor: body.playerColor,
        });
        return jsonResponse(
          await submitMove(body.gameId, {
            fromX: body.fromX,
            fromY: body.fromY,
            playerColor: body.playerColor,
            toX: body.toX,
            toY: body.toY,
          }),
        );

      default:
        throw new GameServiceError("Unsupported action.", 400);
    }
  } catch (error) {
    return getErrorResponse(error);
  }
}
