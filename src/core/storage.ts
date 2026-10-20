import type { ModeId } from './config';
import type { Session } from './engine';

const SESSION_KEY = 'iq-test.session.v1';
const HISTORY_KEY = 'iq-test.history.v1';
const SEEN_KEY = 'iq-test.seen.v1';
const HISTORY_LIMIT = 20;
const SEEN_LIMIT = 3000;

export interface HistoryEntry {
  sessionId: string;
  finishedAt: number;
  mode: ModeId;
  nonverbal: boolean;
  fsiq: number;
  ciLow: number;
  ciHigh: number;
}

export function loadSession(): Session | null {
  const session = read<Session>(SESSION_KEY);
  return session?.version === 1 ? session : null;
}

export function saveSession(session: Session): void {
  write(SESSION_KEY, session);
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage unavailable (private mode); nothing to clear.
  }
}

export function loadHistory(): HistoryEntry[] {
  return read<HistoryEntry[]>(HISTORY_KEY) ?? [];
}

export function recordHistory(entry: HistoryEntry): void {
  const history = loadHistory().filter((h) => h.sessionId !== entry.sessionId);
  write(HISTORY_KEY, [entry, ...history].slice(0, HISTORY_LIMIT));
}

/** Ids of items shown in earlier tests on this device, so retakes get different questions. */
export function loadSeenIds(): string[] {
  return read<string[]>(SEEN_KEY) ?? [];
}

export function rememberSeenIds(ids: readonly string[]): void {
  const merged = [...new Set([...ids, ...loadSeenIds()])];
  write(SEEN_KEY, merged.slice(0, SEEN_LIMIT));
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // Storage unavailable; nothing to clear.
  }
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('Could not save progress to localStorage', err);
  }
}
