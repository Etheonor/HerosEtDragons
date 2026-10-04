/** Pile de toasts globale — un seul <Toaster> par application (layout racine). */
export type ToastKind = "info" | "success" | "error";

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

const DURATIONS: Record<ToastKind, number> = {
  info: 3200,
  success: 3200,
  error: 5200,
};

let seq = 0;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const toasts = $state<Toast[]>([]);

export function showToast(message: string, kind: ToastKind = "info"): number {
  const id = ++seq;
  toasts.push({ id, message, kind });
  const prior = timers.get(id);
  if (prior) clearTimeout(prior);
  timers.set(
    id,
    setTimeout(() => dismissToast(id), DURATIONS[kind]),
  );
  if (toasts.length > 4) dismissToast(toasts[0]!.id);
  return id;
}

export function dismissToast(id: number): void {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  const idx = toasts.findIndex((t) => t.id === id);
  if (idx >= 0) toasts.splice(idx, 1);
}
