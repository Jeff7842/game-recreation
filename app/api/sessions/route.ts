import { listStoredSessions } from "@/apis/json-session-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const sessions = await listStoredSessions();
    console.log("[sessions-api] loaded sessions", { count: sessions.length });
    return Response.json({ sessions });
  } catch (error) {
    console.error("[sessions-api] failed to load sessions", error);
    return Response.json(
      { error: "Something went wrong while loading sessions." },
      { status: 500 },
    );
  }
}
