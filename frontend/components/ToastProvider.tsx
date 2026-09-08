"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";

type ToastRecord = {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  durationMs: number;
};

type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
};

type ToastContextValue = {
  pushToast: (toast: ToastInput) => string;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneClasses: Record<ToastTone, string> = {
  success: "border-success/20 bg-white text-ink",
  error: "border-danger/20 bg-white text-ink",
  info: "border-border bg-white text-ink"
};

const toneDotClasses: Record<ToastTone, string> = {
  success: "bg-success",
  error: "bg-danger",
  info: "bg-accent"
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  function dismissToast(id: string) {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }

    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function pushToast({ title, description, tone = "info", durationMs = 3800 }: ToastInput) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextToast: ToastRecord = {
      id,
      title,
      description,
      tone,
      durationMs
    };

    setToasts((current) => [...current, nextToast]);

    if (typeof window !== "undefined") {
      const timer = window.setTimeout(() => {
        dismissToast(id);
      }, durationMs);
      timersRef.current.set(id, timer);
    }

    return id;
  }

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      pushToast,
      dismissToast
    }),
    []
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 top-4 z-[80] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto rounded-3xl border px-4 py-3 shadow-2xl transition",
              toneClasses[toast.tone]
            )}
          >
            <div className="flex items-start gap-3">
              <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", toneDotClasses[toast.tone])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{toast.title}</p>
                {toast.description ? <p className="mt-1 text-sm text-ink/60">{toast.description}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded-full px-2 py-1 text-xs font-semibold text-ink/45 transition hover:bg-surface-muted hover:text-ink"
                aria-label="Dismiss notification"
              >
                Close
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within a ToastProvider.");
  }

  return context;
}
