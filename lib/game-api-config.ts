const DEFAULT_GAME_API_URL = "/api/game";
const GAME_API_URL_ENV_KEYS = ["GAME_API_URL", "NEXT_PUBLIC_GAME_API_URL"] as const;

export function getGameApiUrl(): string {
  for (const envKey of GAME_API_URL_ENV_KEYS) {
    const apiUrl = process.env[envKey]?.trim();

    if (apiUrl) {
      return apiUrl;
    }
  }

  return DEFAULT_GAME_API_URL;
}
