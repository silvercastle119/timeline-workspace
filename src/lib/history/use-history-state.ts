import { useCallback, useState } from "react";

type History<T> = {
  past: T[];
  present: T;
  future: T[];
};

export function useHistoryState<T>(initial: T | (() => T)) {
  const [history, setHistory] = useState<History<T>>(() => ({
    past: [],
    present: typeof initial === "function" ? (initial as () => T)() : initial,
    future: [],
  }));

  const setState = useCallback((updater: T | ((prev: T) => T)) => {
    setHistory((current) => {
      const next =
        typeof updater === "function"
          ? (updater as (prev: T) => T)(current.present)
          : updater;

      return {
        past: [...current.past, current.present],
        present: next,
        future: [],
      };
    });
  }, []);

  const setStateTransient = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setHistory((current) => {
        const next =
          typeof updater === "function"
            ? (updater as (prev: T) => T)(current.present)
            : updater;

        return { ...current, present: next };
      });
    },
    []
  );

  const commitHistory = useCallback((snapshotBeforeChange: T) => {
    setHistory((current) => ({
      past: [...current.past, snapshotBeforeChange],
      present: current.present,
      future: [],
    }));
  }, []);

  const resetState = useCallback((next: T) => {
    setHistory({ past: [], present: next, future: [] });
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => {
      if (current.past.length === 0) return current;

      const previous = current.past[current.past.length - 1];

      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => {
      if (current.future.length === 0) return current;

      const [next, ...rest] = current.future;

      return {
        past: [...current.past, current.present],
        present: next,
        future: rest,
      };
    });
  }, []);

  return {
    state: history.present,
    setState,
    setStateTransient,
    commitHistory,
    resetState,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
