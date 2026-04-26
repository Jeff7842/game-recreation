"use client";

export type GameToastKind = "error" | "info" | "success";

export type GameToastItem = {
  id: number;
  kind: GameToastKind;
  message: string;
  title: string;
};

type GameToastStackProps = {
  onDismiss: (toastId: number) => void;
  toasts: GameToastItem[];
};

const toastStyles: Record<
  GameToastKind,
  {
    border: string;
    glow: string;
    label: string;
    text: string;
  }
> = {
  error: {
    border: "border-[#ff1c1c]",
    glow: "shadow-[0_0_22px_rgba(255,28,28,0.45)]",
    label: "ALERT",
    text: "text-[#ff5a5a]",
  },
  info: {
    border: "border-[#00ff88]",
    glow: "shadow-[0_0_22px_rgba(0,255,136,0.35)]",
    label: "SYNC",
    text: "text-[#00ff88]",
  },
  success: {
    border: "border-[#ff00ff]",
    glow: "shadow-[0_0_22px_rgba(255,0,255,0.35)]",
    label: "SYSTEM",
    text: "text-[#ff00ff]",
  },
};

export function GameToastStack({ onDismiss, toasts }: GameToastStackProps) {
  return (
    <div
      aria-live="polite"
      aria-relevant="additions text"
      className="pointer-events-none fixed right-3 top-3 z-50 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-3 sm:right-5 sm:top-5"
    >
      {toasts.map((toast) => {
        const styles = toastStyles[toast.kind];

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto border-2 bg-[rgba(0,0,0,0.86)] p-4 ${styles.border} ${styles.glow}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-[9px] leading-none ${styles.text}`}>
                  {styles.label}
                </p>
                <h2
                  className={`mt-2 break-words text-[12px] leading-relaxed ${styles.text}`}
                >
                  {toast.title}
                </h2>
                <p className="mt-2 break-words text-[10px] leading-relaxed text-white">
                  {toast.message}
                </p>
              </div>
              <button
                type="button"
                aria-label="Dismiss message"
                onClick={() => onDismiss(toast.id)}
                className={`shrink-0 border px-2 py-1 text-[10px] ${styles.border} ${styles.text} hover:bg-white hover:text-black`}
              >
                X
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
