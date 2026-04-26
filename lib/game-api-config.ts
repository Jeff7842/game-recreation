const DEFAULT_GAME_API_URL = "/api/game";

export function getGameApiUrl(): string {
  const apiUrl = process.env.GAME_API_URL?.trim();

  return apiUrl || DEFAULT_GAME_API_URL;
}
