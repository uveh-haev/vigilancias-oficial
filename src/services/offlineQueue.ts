import { OfflineQueuedAction } from '../types/clinical';

const OFFLINE_QUEUE_KEY = 'uveh_offline_queue_v1';

export function readOfflineQueue(): OfflineQueuedAction[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineQueuedAction[]) : [];
  } catch {
    return [];
  }
}

export function writeOfflineQueue(items: OfflineQueuedAction[]): void {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota errors
  }
}

export function enqueueOfflineAction(
  action: Omit<OfflineQueuedAction, 'id' | 'createdAt'>
): OfflineQueuedAction[] {
  const current = readOfflineQueue();
  const entry: OfflineQueuedAction = {
    ...action,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const next = [...current, entry];
  writeOfflineQueue(next);
  return next;
}

export function removeOfflineAction(id: string): OfflineQueuedAction[] {
  const next = readOfflineQueue().filter((item) => item.id !== id);
  writeOfflineQueue(next);
  return next;
}

export function clearOfflineQueue(): void {
  writeOfflineQueue([]);
}
