"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import styles from "./toast.module.css";

export type ToastTone = "info" | "success" | "error";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  notify: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const dismissAfterMs = 6_000;

/**
 * Replaces the `alert()` calls the upload flow used to rely on.
 *
 * Messages land in a polite live region so a screen reader announces them
 * without stealing focus mid-upload.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, message }]);
      window.setTimeout(() => {
        dismiss(id);
      }, dismissAfterMs);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.viewport} role="region" aria-label="Notifications">
        <ol className={styles.list} aria-live="polite" aria-atomic="false">
          {toasts.map((toast) => (
            <li key={toast.id} className={styles[toast.tone]}>
              <span className={styles.message}>{toast.message}</span>
              <button
                type="button"
                className={styles.dismiss}
                onClick={() => {
                  dismiss(toast.id);
                }}
              >
                <span className="visuallyHidden">Dismiss notification</span>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside a ToastProvider.");
  }

  return context;
}
