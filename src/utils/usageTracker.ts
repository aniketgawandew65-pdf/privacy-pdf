import { safeStorage, safeSessionStorage } from './safeStorage';
import { getLicenseStatus } from './license';

const DAILY_LIMIT_KEY = 'oneintoone_daily_usage';
const MAX_FREE_DAILY_TASKS = 4;
export const MAX_FREE_FILE_SIZE_MB = 25;
export const MAX_PRO_FILE_SIZE_MB = 150;

interface DailyUsageRecord {
  date: string; // YYYY-MM-DD
  count: number;
}

// Keep credit persistence separate from license/preferences storage. Private or
// restricted browsers may reject localStorage writes; sessionStorage survives
// both ordinary and cache-bypassing reloads within the same tab/session.
let lastKnownUsage: DailyUsageRecord | null = null;

function parseUsage(raw: string | null): DailyUsageRecord | null {
  try {
    const record = JSON.parse(raw || 'null');
    return record && typeof record.date === 'string' &&
      Number.isSafeInteger(record.count) && record.count >= 0
      ? { date: record.date, count: record.count }
      : null;
  } catch {
    return null;
  }
}

function persistUsage(record: DailyUsageRecord): void {
  lastKnownUsage = record;
  const raw = JSON.stringify(record);
  // Avoid redundant storage events between normal-browser tabs.
  if (safeStorage.getItem(DAILY_LIMIT_KEY) !== raw) {
    safeStorage.setItem(DAILY_LIMIT_KEY, raw);
  }
  if (safeSessionStorage.getItem(DAILY_LIMIT_KEY) !== raw) {
    safeSessionStorage.setItem(DAILY_LIMIT_KEY, raw);
  }
}

function readUsage(today: string): DailyUsageRecord {
  const records = [
    parseUsage(safeStorage.getItem(DAILY_LIMIT_KEY)),
    parseUsage(safeSessionStorage.getItem(DAILY_LIMIT_KEY)),
    lastKnownUsage,
  ];
  const record = {
    date: today,
    // Never let an older same-day copy restore credits. This also preserves
    // localStorage's cross-tab behavior when a tab has a stale session backup.
    count: Math.max(0, ...records.filter(r => r?.date === today).map(r => r!.count)),
  };
  // Mirror existing usage on first read, recover a missing/failed storage copy,
  // and keep the existing local-calendar-day reset. Do not initialize storage
  // just because a new visitor looked at the credit counter.
  if (records.some(Boolean)) persistUsage(record);
  return record;
}

function getTodayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function getDailyUsage(): { count: number; remaining: number; max: number; isPro: boolean } {
  const { isPro } = getLicenseStatus();
  if (isPro) {
    return { count: 0, remaining: Infinity, max: Infinity, isPro: true };
  }

  const today = getTodayString();
  const record = readUsage(today);
  const remaining = Math.max(0, MAX_FREE_DAILY_TASKS - record.count);
  return { count: record.count, remaining, max: MAX_FREE_DAILY_TASKS, isPro: false };
}

export function checkActionAllowed(fileSizeBytes?: number): {
  allowed: boolean;
  reason?: 'DAILY_LIMIT' | 'FILE_SIZE_LIMIT';
  errorMessage?: string;
} {
  const { isPro } = getLicenseStatus();

  // 1. File Size Verification
  if (fileSizeBytes !== undefined) {
    const sizeInMb = fileSizeBytes / (1024 * 1024);
    const maxAllowedMb = isPro ? MAX_PRO_FILE_SIZE_MB : MAX_FREE_FILE_SIZE_MB;

    if (sizeInMb > maxAllowedMb) {
      return {
        allowed: false,
        reason: 'FILE_SIZE_LIMIT',
        errorMessage: isPro
          ? `File exceeds the maximum Pro upload limit of ${MAX_PRO_FILE_SIZE_MB}MB.`
          : `Free tier is limited to ${MAX_FREE_FILE_SIZE_MB}MB per file. Upgrade to Pro for files up to ${MAX_PRO_FILE_SIZE_MB}MB.`,
      };
    }
  }

  // 2. Daily Task Count Verification
  if (isPro) {
    return { allowed: true };
  }

  const { count } = getDailyUsage();
  if (count >= MAX_FREE_DAILY_TASKS) {
    return {
      allowed: false,
      reason: 'DAILY_LIMIT',
      errorMessage: `You have reached your free daily limit of ${MAX_FREE_DAILY_TASKS} tasks. Limit resets tomorrow or unlock unlimited with Pro.`,
    };
  }

  return { allowed: true };
}

export function recordActionExecution(): void {
  const { isPro } = getLicenseStatus();
  if (isPro) return;

  const today = getTodayString();
  const record = readUsage(today);
  persistUsage({ date: today, count: record.count + 1 });
}
