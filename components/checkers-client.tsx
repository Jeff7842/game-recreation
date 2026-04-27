"use client";

import Image from "next/image";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getValidMove,
  initialBoard,
  pieces,
  serializeBoard,
  type BoardCell,
  type GameSession,
  type PlayerColor,
} from "@/lib/checkers";
import {
  GameApiError,
  createGameOnServer,
  getGameApiErrorMessage,
  getGameFromServer,
  joinGameOnServer,
  movePieceOnServer,
} from "@/apis/game-api-client";
import {
  GameResultModal,
  type GameResultModalState,
} from "@/components/game-result-modal";
import {
  GameToastStack,
  type GameToastItem,
} from "@/components/game-toast";

const defaultScore = { r: 12, b: 12 };
const persistedSessionKey = "checkers-active-session";
const activeGameRefetchMs = 1500;
const sessionsPreviewRefetchMs = 1500;

type SelectedCell = {
  x: number;
  y: number;
};

type View = "create" | "join" | "game";

type CheckersClientProps = {
  gameApiUrl: string;
};

type PersistedSession = {
  gameId: string;
  playerColor: PlayerColor;
  playerName: string;
};

type SessionStatus = "waiting" | "active" | "finished";

type SessionPreview = {
  createdAt: string;
  game: GameSession;
  id: string;
  result: {
    loserColor: PlayerColor | null;
    loserName: string | null;
    winnerColor: PlayerColor | null;
    winnerName: string | null;
  };
  status: SessionStatus;
  updatedAt: string;
};

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isPlayerColor(value: unknown): value is PlayerColor {
  return value === "r" || value === "b";
}

function readPersistedSession(): PersistedSession | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    const rawSession = window.localStorage.getItem(persistedSessionKey);

    if (!rawSession) {
      return null;
    }

    const parsedSession = JSON.parse(rawSession) as {
      gameId?: unknown;
      playerColor?: unknown;
      playerName?: unknown;
    };

    if (
      typeof parsedSession?.gameId !== "string" ||
      typeof parsedSession?.playerName !== "string" ||
      !isPlayerColor(parsedSession?.playerColor)
    ) {
      return null;
    }

    const normalizedGameId = parsedSession.gameId.trim().toUpperCase();
    const normalizedPlayerName = parsedSession.playerName.trim();

    if (!normalizedGameId || !normalizedPlayerName) {
      return null;
    }

    return {
      gameId: normalizedGameId,
      playerColor: parsedSession.playerColor,
      playerName: normalizedPlayerName,
    };
  } catch {
    return null;
  }
}

function persistSession(session: PersistedSession): void {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(persistedSessionKey, JSON.stringify(session));
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
}

function clearPersistedSession(): void {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.removeItem(persistedSessionKey);
  } catch {
    // Ignore storage clear failures.
  }
}

async function getSessionsPreviewFromServer(): Promise<SessionPreview[]> {
  const response = await fetch("/api/sessions", {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: unknown;
    sessions?: unknown;
  } | null;

  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "Could not load live sessions.",
    );
  }

  if (!payload || !Array.isArray(payload.sessions)) {
    throw new Error("Sessions API returned an invalid response.");
  }

  return payload.sessions as SessionPreview[];
}

function logCheckersClient(
  message: string,
  details?: Record<string, unknown>,
): void {
  console.log(`[checkers-client] ${message}`, details ?? "");
}

function Cell({ piece }: { piece: BoardCell }) {
  if (piece === ".") {
    return null;
  }

  return (
    <Image
      src={pieces[piece]}
      alt={piece}
      width={56}
      height={56}
      className="h-auto w-[72%] max-w-14 object-contain"
    />
  );
}

export default function CheckersClient({ gameApiUrl }: CheckersClientProps) {
  logCheckersClient("rendered checkers client", { gameApiUrl });

  const [initialSession] = useState<PersistedSession | null>(() => {
    const persistedSession = readPersistedSession();

    if (persistedSession) {
      logCheckersClient("hydrating session from local storage", {
        gameId: persistedSession.gameId,
      });
    }

    return persistedSession;
  });
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const [playerName, setPlayerName] = useState(initialSession?.playerName ?? "");
  const [playerColor, setPlayerColor] = useState<PlayerColor | null>(
    initialSession?.playerColor ?? null,
  );
  const [gameId, setGameId] = useState(initialSession?.gameId ?? "");
  const [game, setGame] = useState<GameSession | null>(null);
  const [view, setView] = useState<View>(initialSession ? "game" : "create");
  const [joinGameId, setJoinGameId] = useState(initialSession?.gameId ?? "");
  const [copied, setCopied] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isSubmittingMove, setIsSubmittingMove] = useState(false);
  const [resultModal, setResultModal] = useState<GameResultModalState | null>(
    null,
  );
  const [toasts, setToasts] = useState<GameToastItem[]>([]);
  const queryClient = useQueryClient();
  const gameRef = useRef<GameSession | null>(null);
  const handledResultGameIdRef = useRef<string | null>(null);
  const hasShownSyncUnavailableToastRef = useRef(false);
  const syncMissingCountRef = useRef(0);
  const toastIdRef = useRef(0);
  const toastTimeoutsRef = useRef<number[]>([]);

  useEffect(() => {
    const normalizedGameId = gameId.trim().toUpperCase();
    const normalizedPlayerName = playerName.trim();

    if (view !== "game" || !normalizedGameId || !normalizedPlayerName || !playerColor) {
      clearPersistedSession();
      return;
    }

    persistSession({
      gameId: normalizedGameId,
      playerColor,
      playerName: normalizedPlayerName,
    });
  }, [gameId, playerColor, playerName, view]);

  useEffect(() => {
    logCheckersClient("game ref updated", { gameId: game?.id });
    gameRef.current = game;
  }, [game]);

  const dismissToast = useCallback((toastId: number) => {
    logCheckersClient("dismissing toast", { toastId });
    setToasts((currentToasts) =>
      currentToasts.filter((toast) => toast.id !== toastId),
    );
  }, []);

  const showToast = useCallback(
    (
      toast: Omit<GameToastItem, "id">,
      durationMs = toast.kind === "error" ? 6500 : 4200,
    ) => {
      logCheckersClient("showing toast", { kind: toast.kind, title: toast.title });
      toastIdRef.current += 1;
      const toastId = toastIdRef.current;

      setToasts((currentToasts) =>
        [{ ...toast, id: toastId }, ...currentToasts].slice(0, 4),
      );

      const timeoutId = window.setTimeout(() => {
        dismissToast(toastId);
      }, durationMs);

      toastTimeoutsRef.current.push(timeoutId);
    },
    [dismissToast],
  );

  useEffect(() => {
    const toastTimeouts = toastTimeoutsRef.current;

    return () => {
      logCheckersClient("clearing toast timeouts", {
        count: toastTimeouts.length,
      });
      toastTimeouts.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
    };
  }, []);

  function applyGameState(nextGame: GameSession) {
    logCheckersClient("applying game state", {
      gameId: nextGame.id,
      turn: nextGame.turn,
      winner: nextGame.winner,
    });
    const previousGame = gameRef.current;

    if (
      previousGame &&
      (previousGame.turn !== nextGame.turn ||
        serializeBoard(previousGame.board) !== serializeBoard(nextGame.board))
    ) {
      setSelected(null);
    }

    setGame(nextGame);
  }

  const resetGameState = useCallback(() => {
    logCheckersClient("resetting game state");
    clearPersistedSession();
    setSelected(null);
    setGame(null);
    setGameId("");
    setPlayerColor(null);
    setJoinGameId("");
    setCopied(false);
    setResultModal(null);
    setView("create");
  }, []);

  const applySyncedGameState = useEffectEvent((nextGame: GameSession) => {
    logCheckersClient("applying synced game state", { gameId: nextGame.id });
    const hadSyncMiss = syncMissingCountRef.current > 0;

    syncMissingCountRef.current = 0;
    hasShownSyncUnavailableToastRef.current = false;
    applyGameState(nextGame);

    if (hadSyncMiss) {
      showToast(
        {
          kind: "success",
          title: "Board restored",
          message: "The match is synced again.",
        },
        2800,
      );
    }
  });

  const isGameViewActive = view === "game" && Boolean(gameId);

  const activeGameQuery = useQuery({
    enabled: isGameViewActive,
    queryFn: () => getGameFromServer(gameApiUrl, gameId),
    queryKey: ["game-session", gameApiUrl, gameId],
    refetchInterval: isGameViewActive ? activeGameRefetchMs : false,
    refetchIntervalInBackground: true,
  });

  const sessionsPreviewQuery = useQuery({
    queryFn: getSessionsPreviewFromServer,
    queryKey: ["sessions-preview"],
    refetchInterval: sessionsPreviewRefetchMs,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!activeGameQuery.data) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    applySyncedGameState(activeGameQuery.data);
  }, [activeGameQuery.data]);

  useEffect(() => {
    const error = activeGameQuery.error;

    if (!error) {
      return;
    }

    logCheckersClient("sync failed", {
      message: getGameApiErrorMessage(error),
    });

    if (error instanceof GameApiError && (error.status === 404 || error.status === 403)) {
      syncMissingCountRef.current += 1;

      if (!hasShownSyncUnavailableToastRef.current) {
        hasShownSyncUnavailableToastRef.current = true;
        showToast(
          {
            kind: error.status === 404 ? "info" : "error",
            title: error.status === 404 ? "Reconnecting" : "Sync blocked",
            message:
              error.status === 404
                ? "The server missed this game for a moment. Your board stays open while it retries."
                : getGameApiErrorMessage(error),
          },
          6500,
        );
      } else if (syncMissingCountRef.current === 6) {
        showToast(
          {
            kind: "error",
            title: "Still searching",
            message:
              "The board is still open, but the server cannot find this match yet.",
          },
          8000,
        );
      }

      return;
    }

    showToast({
      kind: "error",
      title: "Request failed",
      message: getGameApiErrorMessage(error),
    });
  }, [activeGameQuery.error, showToast]);

  const board = game?.board ?? initialBoard;
  const turn = game?.turn ?? "r";
  const score = game?.score ?? defaultScore;
  const isPlayerTurn = Boolean(playerColor && turn === playerColor);
  const redPlayerName = game?.players.r ?? "Waiting...";
  const blackPlayerName = game?.players.b ?? "Waiting...";
  const currentTurnLabel = game?.winner
    ? `${game.winner === "r" ? "RED" : "BLACK"} WINS`
    : !game?.players.b
    ? "Waiting for opponent to join..."
    : isPlayerTurn
        ? "YOUR TURN"
        : "OPPONENT'S TURN";
  const sessionPreviews = sessionsPreviewQuery.data ?? [];
  const sessionsUpdatedLabel = sessionsPreviewQuery.dataUpdatedAt
    ? new Date(sessionsPreviewQuery.dataUpdatedAt).toLocaleTimeString()
    : "--";

  const returnHomeAfterResult = useCallback(() => {
    logCheckersClient("returning home after result");
    handledResultGameIdRef.current = null;
    hasShownSyncUnavailableToastRef.current = false;
    syncMissingCountRef.current = 0;
    setIsSubmittingMove(false);
    resetGameState();
  }, [resetGameState]);

  useEffect(() => {
    logCheckersClient("result modal effect evaluated", {
      gameId: game?.id,
      playerColor,
      winner: game?.winner,
    });

    if (
      !game?.winner ||
      !playerColor ||
      handledResultGameIdRef.current === game.id
    ) {
      return;
    }

    const winnerColor = game.winner;
    const loserColor = winnerColor === "r" ? "b" : "r";
    const outcome = winnerColor === playerColor ? "winner" : "loser";
    const winnerName =
      game.players[winnerColor] ?? (winnerColor === "r" ? "Red" : "Black");
    const loserName =
      game.players[loserColor] ?? (loserColor === "r" ? "Red" : "Black");

    handledResultGameIdRef.current = game.id;
    setResultModal({
      loserName,
      outcome,
      winnerColor,
      winnerName,
    });
    showToast(
      {
        kind: outcome === "winner" ? "success" : "info",
        title: outcome === "winner" ? "Victory locked" : "Match complete",
        message:
          outcome === "winner"
            ? "The board is yours."
            : `${winnerName} won this round.`,
      },
      5000,
    );
  }, [game, playerColor, showToast]);

  async function createGame() {
    logCheckersClient("create game clicked");
    const trimmedName = playerName.trim();

    if (!trimmedName || isBusy) {
      logCheckersClient("create game skipped", {
        hasPlayerName: Boolean(trimmedName),
        isBusy,
      });
      return;
    }

    setIsBusy(true);

    try {
      const nextGame = await createGameOnServer(gameApiUrl, trimmedName);
      logCheckersClient("game created", { gameId: nextGame.id });

      handledResultGameIdRef.current = null;
      hasShownSyncUnavailableToastRef.current = false;
      syncMissingCountRef.current = 0;
      setPlayerName(trimmedName);
      setPlayerColor("r");
      setJoinGameId("");
      setGameId(nextGame.id);
      setView("game");
      applyGameState(nextGame);
      queryClient.setQueryData(["game-session", gameApiUrl, nextGame.id], nextGame);
      void queryClient.invalidateQueries({ queryKey: ["sessions-preview"] });
      showToast({
        kind: "info",
        title: "Game created",
        message: "Share the game id with your opponent.",
      });
    } catch (error) {
      logCheckersClient("create game failed", {
        message: getGameApiErrorMessage(error),
      });
      showToast({
        kind: "error",
        title: "Create failed",
        message: getGameApiErrorMessage(error),
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function joinGame() {
    logCheckersClient("join game clicked");
    const trimmedName = playerName.trim();
    const normalizedGameId = joinGameId.trim().toUpperCase();

    if (!trimmedName || !normalizedGameId || isBusy) {
      logCheckersClient("join game skipped", {
        gameId: normalizedGameId,
        hasPlayerName: Boolean(trimmedName),
        isBusy,
      });
      return;
    }

    setIsBusy(true);

    try {
      const nextGame = await joinGameOnServer(
        gameApiUrl,
        normalizedGameId,
        trimmedName,
      );
      logCheckersClient("game joined", { gameId: nextGame.id });

      handledResultGameIdRef.current = null;
      hasShownSyncUnavailableToastRef.current = false;
      syncMissingCountRef.current = 0;
      setPlayerName(trimmedName);
      setPlayerColor("b");
      setJoinGameId(normalizedGameId);
      setGameId(nextGame.id);
      setView("game");
      applyGameState(nextGame);
      queryClient.setQueryData(["game-session", gameApiUrl, nextGame.id], nextGame);
      void queryClient.invalidateQueries({ queryKey: ["sessions-preview"] });
      showToast({
        kind: "success",
        title: "Joined game",
        message: "You are playing black.",
      });
    } catch (error) {
      logCheckersClient("join game failed", {
        message: getGameApiErrorMessage(error),
      });
      showToast({
        kind: "error",
        title: "Join failed",
        message: getGameApiErrorMessage(error),
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleClick(x: number, y: number) {
    logCheckersClient("board cell clicked", { x, y });
    const activeGame = gameRef.current;

    if (
      !activeGame ||
      !playerColor ||
      isSubmittingMove ||
      activeGame.winner ||
      !activeGame.players.b ||
      activeGame.turn !== playerColor
    ) {
      logCheckersClient("board click ignored", {
        gameId: activeGame?.id,
        hasPlayerColor: Boolean(playerColor),
        isSubmittingMove,
      });
      return;
    }

    const piece = activeGame.board[y][x];

    if (!selected) {
      if (piece !== "." && piece.toLowerCase() === playerColor) {
        logCheckersClient("piece selected", { x, y, piece });
        setSelected({ x, y });
      }

      return;
    }

    const move = getValidMove(activeGame.board, selected.x, selected.y, x, y);

    if (!move) {
      logCheckersClient("invalid local move selection", { from: selected, to: { x, y } });
      setSelected(null);
      return;
    }

    setIsSubmittingMove(true);

    try {
      const nextGame = await movePieceOnServer(gameApiUrl, {
        gameId: activeGame.id,
        fromX: selected.x,
        fromY: selected.y,
        playerColor,
        toX: x,
        toY: y,
      });

      logCheckersClient("move submitted", { gameId: nextGame.id });
      setSelected(null);
      applyGameState(nextGame);
      queryClient.setQueryData(["game-session", gameApiUrl, nextGame.id], nextGame);
      void queryClient.invalidateQueries({ queryKey: ["sessions-preview"] });
    } catch (error) {
      logCheckersClient("move failed", {
        message: getGameApiErrorMessage(error),
      });
      showToast({
        kind: "error",
        title: "Move failed",
        message: getGameApiErrorMessage(error),
      });
    } finally {
      setIsSubmittingMove(false);
    }
  }

  async function copyGameId() {
    logCheckersClient("copy game id clicked", { gameId });
    if (!gameId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(gameId);
      logCheckersClient("game id copied", { gameId });
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
      showToast(
        {
          kind: "success",
          title: "Game id copied",
          message: "Send it to your opponent.",
        },
        2400,
      );
    } catch {
      logCheckersClient("game id copy failed", { gameId });
      showToast({
        kind: "error",
        title: "Copy failed",
        message: "Could not copy the game id.",
      });
    }
  }

  function exitGame() {
    logCheckersClient("exiting game", { gameId });
    handledResultGameIdRef.current = null;
    hasShownSyncUnavailableToastRef.current = false;
    syncMissingCountRef.current = 0;
    resetGameState();
    showToast({
      kind: "info",
      title: "Exited game",
      message: "You are back at the home screen.",
    });
  }

  return (
    <>
      <GameToastStack onDismiss={dismissToast} toasts={toasts} />
      {resultModal && (
        <GameResultModal {...resultModal} onHome={returnHomeAfterResult} />
      )}

      <div
        className={`${view === "create" ? "flex" : "hidden"} w-full min-h-dvh items-center justify-center px-4 py-6 sm:px-8`}
      >
        <div className="flex w-full max-w-2xl items-center justify-center bg-[rgb(0,0,0,0.6)] border-4 border-[#00ff88] p-6 sm:p-10 glow-pulse">
          <div className="w-full">
            <div className="block w-full text-center gap-5 pb-5 m-auto place-items-center float-title">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={56}
                height={56}
                viewBox="0 0 24 24"
                className="mb-4 sm:mb-5"
              >
                <path
                  fill="none"
                  stroke="#ff00ff"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19.2 17L21 7l-6.3 3L12 7l-2.7 3L3 7l1.8 10z"
                ></path>
              </svg>
              <h1 className="text-[22px] sm:text-[26px] font-bold text-[#00ff88] tracking-wider leading-relaxed text-shadow-[0_0_10px_#00ff88,0_0_0px_#00ff88,0_0_0px_#00ff88]">
                NETWORK <br />
                <span className="text-[#ff00ff] text-shadow-[0_0_10px_#ff00ff,0_0_0px_#ff00ff,0_0_0px_#ff00ff]">
                  CHECKERS
                </span>
              </h1>
            </div>

            <div className="pt-5">
              <label htmlFor="username" className="text-[11px] text-[#00ff88]">
                PLAYER NAME
              </label>
              <div className="flex text-[10px] text-[#00ff88] pt-1.5">
                <input
                  type="text"
                  id="username"
                  name="username"
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  className="w-full border-2 border-[#00ff88] p-3 sm:p-4 text-[12px] sm:text-[14px] focus:outline-none placeholder-gray-500"
                />
              </div>
              <div className="pt-8 grid gap-4 h-auto w-full">
                <button
                  disabled={!playerName.trim() || isBusy}
                  onClick={createGame}
                  className={`flex w-full gap-2 text-center justify-center p-4 sm:p-5 text-black text-[12px] ${
                    !playerName.trim() || isBusy
                      ? "cursor-not-allowed bg-gray-600"
                      : "cursor-pointer bg-[#00ff88]"
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width={16}
                    height={16}
                    viewBox="0 0 24 24"
                  >
                    <g
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                    >
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.128a4 4 0 0 1 0 7.744M22 21v-2a4 4 0 0 0-3-3.87"></path>
                      <circle cx={9} cy={7} r={4}></circle>
                    </g>
                  </svg>
                  Create Game
                </button>
                <button
                  disabled={!playerName.trim() || isBusy}
                  onClick={() => setView("join")}
                  className={`flex w-full gap-2 text-center justify-center p-4 sm:p-5 text-black text-[12px] ${
                    !playerName.trim() || isBusy
                      ? "cursor-not-allowed bg-gray-600"
                      : "cursor-pointer bg-[#ff00ff]"
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width={16}
                    height={16}
                    viewBox="0 0 256 256"
                  >
                    <path
                      fill="currentColor"
                      d="m229.5 113l-63.44-23.06L143 26.5a16 16 0 0 0-30 0L89.94 89.94L26.5 113a16 16 0 0 0 0 30l63.44 23.07L113 229.5a16 16 0 0 0 30 0l23.07-63.44L229.5 143a16 16 0 0 0 0-30m-72.42 39.3a8 8 0 0 0-4.78 4.78L128 223.9l-24.3-66.82a8 8 0 0 0-4.78-4.78L32.1 128l66.82-24.3a8 8 0 0 0 4.78-4.78L128 32.1l24.3 66.82a8 8 0 0 0 4.78 4.78L223.9 128Z"
                    ></path>
                  </svg>
                  Join Game
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`${view === "join" ? "flex" : "hidden"} w-full min-h-dvh items-center justify-center px-4 py-6 sm:px-8`}
      >
        <div className="flex w-full max-w-2xl items-center justify-center bg-[rgb(0,0,0,0.6)] border-4 border-[#ff00ff] p-6 sm:p-10 shadow-[0_0_0px_rgba(255,0,255,0.5),0_0_0px_rgba(255,0,255,0.5),0_0_35px_rgba(255,0,255,0.5)] glow-join-pulse">
          <div className="w-full">
            <div className="block w-full text-center gap-5 pb-0 m-auto place-items-center">
              <h1 className="text-[18px] font-bold text-[#ff00ff] tracking-wider leading-relaxed text-shadow-[0_0_10px_#ff00ff,0_0_0px_#ff00ff,0_0_0px_#ff00ff]">
                Join Game
              </h1>
            </div>

            <div className="pt-5">
              <label htmlFor="game-id" className="text-[11px] text-[#ff00ff]">
                GAME ID
              </label>
              <div className="flex text-[10px] text-[#ff00ff] pt-1.5">
                <input
                  type="text"
                  value={joinGameId}
                  onChange={(event) =>
                    setJoinGameId(event.target.value.toUpperCase())
                  }
                  id="game-id"
                  name="game-id"
                  placeholder="CHK-XXXXXXXX"
                  className="w-full border-2 border-[#ff00ff] p-3 sm:p-4 text-[12px] sm:text-[14px] focus:outline-none placeholder-gray-500"
                />
              </div>
              <div className="pt-8 grid gap-4 h-auto w-full">
                <button
                  disabled={!joinGameId.trim() || isBusy}
                  onClick={joinGame}
                  className={`flex w-full gap-2 text-center justify-center p-4 sm:p-5 text-black text-[12px] ${
                    !joinGameId.trim() || isBusy
                      ? "cursor-not-allowed bg-gray-600"
                      : "cursor-pointer bg-[#ff00ff]"
                  }`}
                >
                  JOIN GAME
                </button>
                <button
                  disabled={isBusy}
                  onClick={() => {
                    setJoinGameId("");
                    setView("create");
                  }}
                  className="flex w-full gap-2 text-center justify-center bg-transparent border-2 border-[#ff00ff] p-4 sm:p-5 text-[#ff00ff] text-[12px] cursor-pointer"
                >
                  BACK
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`${view === "game" ? "flex" : "hidden"} w-full min-h-dvh items-start justify-center px-3 py-4 sm:px-6 sm:py-8`}
      >
        <div className="flex w-full max-w-300 flex-col items-center justify-start gap-4">
          <div className="flex w-full items-center justify-center bg-[rgb(0,0,0,0.6)] border-4 border-[#00ff88] p-3 sm:p-5">
            <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3 sm:items-center">
              <div className="flex w-full items-center justify-start text-left">
                <h1 className="text-[10px] sm:text-[11px] text-[#00ff88] tracking-wider leading-relaxed">
                  GAME ID <br />
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-[13px] sm:text-[14px] text-[#ff00ff] break-all">
                    {gameId}
                    <button
                      type="button"
                      className="border-2 border-[#ff00ff] bg-transparent p-2 hover:bg-[#ff00ff] cursor-pointer hover:text-black"
                      onClick={copyGameId}
                    >
                      {copied ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width={18}
                          height={18}
                          viewBox="0 0 24 24"
                        >
                          <path
                            fill="currentColor"
                            d="M21 7L9 19l-5.5-5.5l1.41-1.41L9 16.17L19.59 5.59z"
                            strokeWidth={0.5}
                            stroke="currentColor"
                          ></path>
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width={18}
                          height={18}
                          viewBox="0 0 24 24"
                        >
                          <g fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M14 7c0-.932 0-1.398-.152-1.765a2 2 0 0 0-1.083-1.083C12.398 4 11.932 4 11 4H8c-1.886 0-2.828 0-3.414.586S4 6.114 4 8v3" />
                            <rect width={10} height={10} x={10} y={10} rx={2} />
                          </g>
                        </svg>
                      )}
                    </button>
                  </span>
                </h1>
              </div>

              <div className="flex flex-col justify-center gap-1 text-center sm:pt-5">
                <label htmlFor="current-turn" className="text-[10px] text-[#00ff88]">
                  CURRENT TURN
                </label>
                <label
                  id="current-turn"
                  className={`text-[14px] ${
                    turn === "r" ? "text-[#ff0000]" : "text-white"
                  }`}
                >
                  {currentTurnLabel}
                </label>
              </div>

              <div className="flex w-full justify-start sm:justify-end">
                <button
                  type="button"
                  onClick={exitGame}
                  className="flex w-full justify-center gap-2 bg-[#ff1c1c] px-5 py-3 text-black text-[12px] cursor-pointer sm:w-auto"
                >
                  Exit
                </button>
              </div>
            </div>
          </div>

          <div className="grid w-full grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
            <div className="order-2 md:order-1 w-full p-3 sm:p-4 bg-[rgba(0,0,0,0.6)] border-4 border-[#ff0000] glow-join-pulse items-center justify-center">
              <div className="w-full">
                <div className="block w-full text-center gap-5 pb-0 m-auto place-items-center">
                  <h1 className="text-[12px] text-[#ff0000] tracking-wider leading-relaxed text-shadow-[0_0_10px_#ff0000,0_0_0px_#ff0000,0_0_0px_#ff0000]">
                    RED PLAYER
                  </h1>
                </div>

                <div className="pt-5">
                  <p className="text-[11px] text-[#ffffff] text-center">{redPlayerName}</p>
                  <div className="text-center justify-center text-[10px] items-center flex gap-2 text-[#ff0000] p-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width={16}
                      height={16}
                      viewBox="0 0 16 16"
                    >
                      <path
                        fill="currentColor"
                        d="M2.5.5A.5.5 0 0 1 3 0h10a.5.5 0 0 1 .5.5q0 .807-.034 1.536a3 3 0 1 1-1.133 5.89c-.79 1.865-1.878 2.777-2.833 3.011v2.173l1.425.356c.194.048.377.135.537.255L13.3 15.1a.5.5 0 0 1-.3.9H3a.5.5 0 0 1-.3-.9l1.838-1.379c.16-.12.343-.207.537-.255L6.5 13.11v-2.173c-.955-.234-2.043-1.146-2.833-3.012a3 3 0 1 1-1.132-5.89A33 33 0 0 1 2.5.5m.099 2.54a2 2 0 0 0 .72 3.935c-.333-1.05-.588-2.346-.72-3.935m10.083 3.935a2 2 0 0 0 .72-3.935c-.133 1.59-.388 2.885-.72 3.935M3.504 1q.01.775.056 1.469c.13 2.028.457 3.546.87 4.667C5.294 9.48 6.484 10 7 10a.5.5 0 0 1 .5.5v2.61a1 1 0 0 1-.757.97l-1.426.356a.5.5 0 0 0-.179.085L4.5 15h7l-.638-.479a.5.5 0 0 0-.18-.085l-1.425-.356a1 1 0 0 1-.757-.97V10.5A.5.5 0 0 1 9 10c.516 0 1.706-.52 2.57-2.864c.413-1.12.74-2.64.87-4.667q.045-.694.056-1.469z"
                        strokeWidth={0.5}
                        stroke="currentColor"
                      ></path>
                    </svg>
                    <p className="text-[15px]">{score.r}</p>
                  </div>

                  {turn === "r" && (
                    <div className="pt-2 grid gap-4 h-auto w-full">
                      <button
                        type="button"
                        disabled
                        className="flex w-full gap-2 text-center justify-center bg-[#ff0000] p-2 text-black text-[10px]"
                      >
                        Active
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="order-1 md:order-2 w-full flex justify-center items-center p-2 sm:p-3 bg-[rgba(0,0,0,0.6)] border-4 border-[#00ff88] glow-pulse">
              <div className="grid grid-cols-8 w-full max-w-150 aspect-square border-4 border-gray-700">
                {board.map((row, y) =>
                  row.map((cell, x) => {
                    const isDark = (x + y) % 2 === 1;
                    const isSelected = selected?.x === x && selected?.y === y;

                    return (
                      <button
                        key={`${x}-${y}`}
                        type="button"
                        onClick={() => void handleClick(x, y)}
                        disabled={
                          isSubmittingMove ||
                          !!game?.winner ||
                          !playerColor
                        }
                        className={`w-full aspect-square flex items-center justify-center ${
                          isDark ? "bg-[#331b4b]" : "bg-[#6b5184]"
                        } ${isSelected ? "ring-2 ring-inset ring-green-500" : ""}
                         ${isSubmittingMove ? "cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <Cell piece={cell} />
                      </button>
                    );
                  }),
                )}
              </div>
            </div>

            <div className="order-3 w-full p-3 sm:p-4 bg-[rgba(0,0,0,0.6)] border-4 border-white glow-join-pulse">
              <div className="w-full">
                <div className="block w-full text-center gap-5 pb-0 m-auto place-items-center">
                  <h1 className="text-[12px] text-[#ffffff] tracking-wider leading-relaxed">
                    BLACK PLAYER
                  </h1>
                </div>

                <div className="pt-5">
                  <p className="text-[11px] text-[#ffffff] text-center">
                    {blackPlayerName}
                  </p>
                  <div className="text-center justify-center text-[10px] items-center flex gap-2 text-[#ffffff] p-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width={16}
                      height={16}
                      viewBox="0 0 16 16"
                    >
                      <path
                        fill="currentColor"
                        d="M2.5.5A.5.5 0 0 1 3 0h10a.5.5 0 0 1 .5.5q0 .807-.034 1.536a3 3 0 1 1-1.133 5.89c-.79 1.865-1.878 2.777-2.833 3.011v2.173l1.425.356c.194.048.377.135.537.255L13.3 15.1a.5.5 0 0 1-.3.9H3a.5.5 0 0 1-.3-.9l1.838-1.379c.16-.12.343-.207.537-.255L6.5 13.11v-2.173c-.955-.234-2.043-1.146-2.833-3.012a3 3 0 1 1-1.132-5.89A33 33 0 0 1 2.5.5m.099 2.54a2 2 0 0 0 .72 3.935c-.333-1.05-.588-2.346-.72-3.935m10.083 3.935a2 2 0 0 0 .72-3.935c-.133 1.59-.388 2.885-.72 3.935M3.504 1q.01.775.056 1.469c.13 2.028.457 3.546.87 4.667C5.294 9.48 6.484 10 7 10a.5.5 0 0 1 .5.5v2.61a1 1 0 0 1-.757.97l-1.426.356a.5.5 0 0 0-.179.085L4.5 15h7l-.638-.479a.5.5 0 0 0-.18-.085l-1.425-.356a1 1 0 0 1-.757-.97V10.5A.5.5 0 0 1 9 10c.516 0 1.706-.52 2.57-2.864c.413-1.12.74-2.64.87-4.667q.045-.694.056-1.469z"
                        strokeWidth={0.5}
                        stroke="currentColor"
                      ></path>
                    </svg>
                    <p className="text-[15px]">{score.b}</p>
                  </div>

                  {turn === "b" && (
                    <div className="pt-2 grid gap-4 h-auto w-full">
                      <button
                        type="button"
                        disabled
                        className="w-full gap-2 text-center justify-center flex bg-[#ffffff] p-2 text-black text-[10px]"
                      >
                        Active
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full px-3 pb-6 sm:px-6 sm:pb-8">
        <div className="mx-auto w-full max-w-300 border-4 border-[#00d4ff] bg-[rgba(0,0,0,0.62)] p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[11px] text-[#00d4ff] tracking-wider">
              LIVE SESSION PREVIEW
            </h2>
            <p className="text-[9px] text-[#9ba8c9]">
              {sessionsPreviewQuery.isFetching
                ? "SYNCING..."
                : `UPDATED ${sessionsUpdatedLabel}`}
            </p>
          </div>

          {sessionsPreviewQuery.isError ? (
            <p className="mt-4 text-[9px] text-[#ff6f6f]">
              {getGameApiErrorMessage(sessionsPreviewQuery.error)}
            </p>
          ) : sessionsPreviewQuery.isLoading ? (
            <p className="mt-4 text-[9px] text-[#9ba8c9]">Loading sessions...</p>
          ) : sessionPreviews.length === 0 ? (
            <p className="mt-4 text-[9px] text-[#9ba8c9]">
              No sessions yet. Create a game to start live previews.
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sessionPreviews.map((session) => {
                const isActiveSession = session.id === gameId;
                const turnLabel = session.game.winner
                  ? `${session.game.winner === "r" ? "RED" : "BLACK"} WON`
                  : session.game.turn === "r"
                    ? "RED TURN"
                    : "BLACK TURN";
                const statusClass =
                  session.status === "finished"
                    ? "text-[#00ff88]"
                    : session.status === "active"
                      ? "text-[#ffdd55]"
                      : "text-[#72d4ff]";

                return (
                  <article
                    key={session.id}
                    className={`border-2 p-3 ${
                      isActiveSession ? "border-[#00ff88]" : "border-[#44516f]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[9px] text-[#00d4ff]">ID {session.id}</p>
                      <span className={`text-[9px] ${statusClass}`}>
                        {session.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="mt-2 text-[9px] text-[#f5f5f5]">{turnLabel}</p>
                    <p className="mt-1 text-[8px] text-[#b6b6b6]">
                      R: {session.game.players.r ?? "Waiting"} | B: {session.game.players.b ?? "Waiting"}
                    </p>

                    <div className="mt-2 grid grid-cols-8 border border-[#5d6887]">
                      {session.game.board.map((row, y) =>
                        row.map((cell, x) => {
                          const isDark = (x + y) % 2 === 1;
                          const pieceColor =
                            cell.toLowerCase() === "r" ? "text-[#ff4b4b]" : "text-[#f5f5f5]";

                          return (
                            <div
                              key={`${session.id}-${x}-${y}`}
                              className={`flex aspect-square items-center justify-center text-[8px] ${
                                isDark ? "bg-[#221530]" : "bg-[#4c3766]"
                              }`}
                            >
                              {cell !== "." ? (
                                <span className={pieceColor}>
                                  {cell === "R" || cell === "B" ? "K" : "o"}
                                </span>
                              ) : null}
                            </div>
                          );
                        }),
                      )}
                    </div>

                    <p className="mt-2 text-[8px] text-[#9ba8c9]">
                      Updated {new Date(session.updatedAt).toLocaleTimeString()}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
