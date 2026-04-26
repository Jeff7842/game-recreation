import type { GameSession } from "@/lib/checkers";

type GameEventSubscriber = (game: GameSession) => void;

const gameSubscribers = new Map<string, Set<GameEventSubscriber>>();

function normalizeGameId(gameId: string): string {
  return gameId.trim().toUpperCase();
}

export function subscribeToGameEvents(
  gameId: string,
  subscriber: GameEventSubscriber,
): () => void {
  const normalizedGameId = normalizeGameId(gameId);
  const subscribers = gameSubscribers.get(normalizedGameId) ?? new Set();

  subscribers.add(subscriber);
  gameSubscribers.set(normalizedGameId, subscribers);

  return () => {
    subscribers.delete(subscriber);

    if (subscribers.size === 0) {
      gameSubscribers.delete(normalizedGameId);
    }
  };
}

export function publishGameUpdate(game: GameSession): void {
  const subscribers = gameSubscribers.get(normalizeGameId(game.id));

  if (!subscribers) {
    return;
  }

  subscribers.forEach((subscriber) => {
    subscriber(game);
  });
}
