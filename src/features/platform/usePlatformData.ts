"use client";

// Loads platform data without the shared query client. The school's screens use TanStack Query (its module is shared with every
// school route); the platform's few screens do not, so the platform stays out of the school's budget (ADR 0027).
import { useCallback, useEffect, useState } from "react";

export interface PlatformData<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

export function usePlatformData<T>(load: () => Promise<T>, key: string): PlatformData<T> {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    load().then(
      (data) => {
        if (alive) setState({ data, error: null, loading: false });
      },
      (error: unknown) => {
        if (alive) setState({ data: null, error, loading: false });
      },
    );
    return () => {
      alive = false;
    };
    // The loader is named by the key; a new key or an explicit reload loads again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, reload };
}
