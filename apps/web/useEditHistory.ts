import { useState } from "react";
export type History<T> = { past: T[]; present: T; future: T[] };
export function editHistory<T>(h: History<T>, value: T): History<T> {
  if (JSON.stringify(h.present) === JSON.stringify(value)) return h;
  return {
    past: [...h.past, h.present].slice(-50),
    present: value,
    future: [],
  };
}
export function useEditHistory<T>(initial: T) {
  const [h, set] = useState<History<T>>({
    past: [],
    present: initial,
    future: [],
  });
  return {
    value: h.present,
    canUndo: !!h.past.length,
    canRedo: !!h.future.length,
    change: (value: T | ((old: T) => T)) =>
      set((old) =>
        editHistory(
          old,
          typeof value === "function"
            ? (value as (old: T) => T)(old.present)
            : value,
        ),
      ),
    undo: () =>
      set((old) =>
        old.past.length
          ? {
              past: old.past.slice(0, -1),
              present: old.past.at(-1)!,
              future: [old.present, ...old.future],
            }
          : old,
      ),
    redo: () =>
      set((old) =>
        old.future.length
          ? {
              past: [...old.past, old.present],
              present: old.future[0],
              future: old.future.slice(1),
            }
          : old,
      ),
  };
}
