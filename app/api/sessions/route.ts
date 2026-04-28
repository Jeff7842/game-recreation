import { GameServiceError, createGame, joinGame } from "@/apis/game-service";
import { listStoredSessions } from "@/apis/json-session-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const playerA = searchParams.get("playerAid");
    const playerB = searchParams.get("playerBid");
    const gameId = searchParams.get("gameId");

    if (playerA && !playerB && !gameId) {
      const game = await createGame(playerA);
      console.log("[sessions-api] Created new session", { gameId: game.id });

      if(!playerA || !gameId) {
        return Response.json(
          { error: "Player A and game ID are required to create a game." },
          { status: 400 }
        );
      }
      return Response.json({ session: game });
    }

    if (playerB && gameId) {
      const game = await joinGame(gameId, playerB);
      console.log("[sessions-api] Player B joined", { gameId: game.id });
      return Response.json({ session: game });
    }

    if (playerA && playerB && gameId) {
      const game = await joinGame(gameId, playerB) && await createGame(playerA);

      if (!game) {
        return Response.json(
          { error: "Game not found" },
          { status: 404 }
        );
      }

      return Response.json({
        message: "Game ready",
        game,
      });
    }

    const sessions = await listStoredSessions();
    console.log("[sessions-api] loaded sessions", { count: sessions.length });
    return Response.json({ sessions });
  } catch (error) {
    if (error instanceof GameServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("[sessions-api] failed to load sessions", error);
    return Response.json(
      { error: "Something went wrong while loading sessions." },
      { status: 500 },
    );
  }
}
