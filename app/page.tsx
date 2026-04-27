import { connection } from "next/server";

import CheckersClient from "@/components/checkers-client";
import { getGameApiUrl } from "@/lib/game-api-config";

export const dynamic = "force-dynamic";

function logHomePage(message: string, details?: Record<string, unknown>): void {
  console.log(`[home-page] ${message}`, details ?? "");
}

export default async function Home() {
  logHomePage("render requested");

  let gameApiUrl: string;

  try {
    await connection();
    gameApiUrl = getGameApiUrl();
  } catch (error) {
    console.error("[home-page] failed before render", error);
    throw error;
  }

  logHomePage("rendering checkers client", { gameApiUrl });
  return <CheckersClient gameApiUrl={gameApiUrl} />;
}
