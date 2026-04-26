import type { NextRequest } from "next/server";

import { GameServiceError, getGame } from "@/apis/game-service";
import { subscribeToGameEvents } from "@/apis/game-event-stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const heartbeatIntervalMs = 25000;
const textEncoder = new TextEncoder();

const corsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

function withCors(init: ResponseInit = {}): ResponseInit {
  const headers = new Headers(init.headers);

  Object.entries(corsHeaders).forEach(([name, value]) => {
    headers.set(name, value);
  });

  return {
    ...init,
    headers,
  };
}

function getGameIdFromRequest(request: NextRequest): string | null {
  const gameId =
    request.nextUrl.searchParams.get("id") ??
    request.nextUrl.searchParams.get("gameId");

  return gameId?.trim() ? gameId : null;
}

function getGameErrorPayload(error: unknown): {
  message: string;
  status: number;
} {
  if (error instanceof GameServiceError) {
    return {
      message: error.message,
      status: error.status,
    };
  }

  console.error("Game stream failed:", error);

  return {
    message: "Something went wrong while opening the live game stream.",
    status: 500,
  };
}

function formatSseMessage(eventName: string, data: unknown): Uint8Array {
  const serializedData = JSON.stringify(data);

  return textEncoder.encode(`event: ${eventName}\ndata: ${serializedData}\n\n`);
}

export function OPTIONS() {
  return new Response(null, withCors({ status: 204 }));
}

export function GET(request: NextRequest) {
  const gameId = getGameIdFromRequest(request);

  if (!gameId) {
    return Response.json(
      { error: "Missing game id in the live stream request." },
      withCors({ status: 400 }),
    );
  }

  let heartbeatId: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: () => void = () => undefined;

  const stream = new ReadableStream({
    async start(controller) {
      let isOpen = true;

      function closeStream() {
        if (!isOpen) {
          return;
        }

        isOpen = false;
        unsubscribe();

        if (heartbeatId) {
          clearInterval(heartbeatId);
          heartbeatId = null;
        }
      }

      function send(eventName: string, data: unknown) {
        if (!isOpen) {
          return;
        }

        try {
          controller.enqueue(formatSseMessage(eventName, data));
        } catch {
          closeStream();
        }
      }

      request.signal.addEventListener("abort", closeStream, { once: true });

      unsubscribe = subscribeToGameEvents(gameId, (nextGame) => {
        send("game", nextGame);
      });

      heartbeatId = setInterval(() => {
        send("ping", { at: new Date().toISOString() });
      }, heartbeatIntervalMs);

      send("ready", { heartbeatIntervalMs });

      try {
        send("game", await getGame(gameId));
      } catch (error) {
        send("game-error", getGameErrorPayload(error));
      }
    },
    cancel() {
      unsubscribe();

      if (heartbeatId) {
        clearInterval(heartbeatId);
        heartbeatId = null;
      }
    },
  });

  return new Response(
    stream,
    withCors({
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      },
    }),
  );
}
