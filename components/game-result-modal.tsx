"use client";

import { useEffect, useState } from "react";

import type { PlayerColor } from "@/lib/checkers";

export type GameResultOutcome = "loser" | "winner";

export type GameResultModalState = {
  loserName: string;
  outcome: GameResultOutcome;
  winnerColor: PlayerColor;
  winnerName: string;
};

type GameResultModalProps = GameResultModalState & {
  onHome: () => void;
};

const resetDelaySeconds = 5;

export function GameResultModal({
  loserName,
  onHome,
  outcome,
  winnerColor,
  winnerName,
}: GameResultModalProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(resetDelaySeconds);
  const isWinner = outcome === "winner";

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setSecondsRemaining((currentSeconds) => Math.max(0, currentSeconds - 1));
    }, 1000);
    const timeoutId = window.setTimeout(onHome, resetDelaySeconds * 1000);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [onHome]);

  return (
    <div className="fixed inset-0 z-40 flex min-h-dvh items-center justify-center bg-[rgba(0,0,0,0.78)] px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-result-title"
        className={`w-full max-w-xl border-4 bg-[rgba(0,0,0,0.9)] p-6 text-center sm:p-8 ${
          isWinner
            ? "border-[#00ff88] shadow-[0_0_40px_rgba(0,255,136,0.45)]"
            : "border-[#ff1c1c] shadow-[0_0_40px_rgba(255,28,28,0.45)]"
        }`}
      >
        <p
          className={`text-[10px] ${
            isWinner ? "text-[#ff00ff]" : "text-[#ff5a5a]"
          }`}
        >
          MATCH COMPLETE
        </p>
        <h2
          id="game-result-title"
          className={`mt-5 text-[24px] leading-relaxed sm:text-[32px] ${
            isWinner ? "text-[#00ff88]" : "text-[#ff1c1c]"
          }`}
        >
          {isWinner ? "YOU WIN" : "YOU LOSE"}
        </h2>
        <div className="mt-6 grid gap-3 text-[11px] leading-relaxed text-white">
          <p>
            WINNER:{" "}
            <span
              className={winnerColor === "r" ? "text-[#ff1c1c]" : "text-white"}
            >
              {winnerName}
            </span>
          </p>
          <p>
            LOSER: <span className="text-[#ff00ff]">{loserName}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onHome}
          className={`mt-8 w-full border-2 px-5 py-4 text-[11px] text-black sm:w-auto ${
            isWinner
              ? "border-[#00ff88] bg-[#00ff88]"
              : "border-[#ff1c1c] bg-[#ff1c1c]"
          }`}
        >
          HOME IN {secondsRemaining}s
        </button>
      </div>
    </div>
  );
}
