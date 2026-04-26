import { listStoredSessions } from "@/apis/json-session-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sessions = await listStoredSessions();
    return Response.json({ sessions });
  } catch {
    return Response.json(
      { error: "Something went wrong while loading sessions." },
      { status: 500 },
    );
  }
}
