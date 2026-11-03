type Listener = () => void;
const listeners = new Set<Listener>();

export function notifyHotkeysChanged(): void {
  for (const fn of listeners) fn();
}

export function subscribeHotkeys(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
