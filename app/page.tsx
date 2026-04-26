import { connection } from "next/server";

import CheckersClient from "@/components/checkers-client";
import { getGameApiUrl } from "@/lib/game-api-config";

export const dynamic = "force-dynamic";

export default async function Home() {
  await connection();

  return <CheckersClient gameApiUrl={getGameApiUrl()} />;
}
