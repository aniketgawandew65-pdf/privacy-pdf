import { getLicenseStatus } from './license';

const DAILY_LIMIT_KEY = 'oneintoone_daily_usage';
const MAX_FREE_DAILY_TASKS = 4;
export const MAX_FREE_FILE_SIZE_MB = 25;
export const MAX_PRO_FILE_SIZE_MB = 150;

interface DailyUsageRecord {
  date: string; // YYYY-MM-DD
  count: number;
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
  const raw = localStorage.getItem(DAILY_LIMIT_KEY);

  if (!raw) {
    return { count: 0, remaining: MAX_FREE_DAILY_TASKS, max: MAX_FREE_DAILY_TASKS, isPro: false };
  }

  try {
    const record: DailyUsageRecord = JSON.parse(raw);
    if (record.date !== today) {
      // New day: reset usage counter
      localStorage.setItem(DAILY_LIMIT_KEY, JSON.stringify({ date: today, count: 0 }));
      return { count: 0, remaining: MAX_FREE_DAILY_TASKS, max: MAX_FREE_DAILY_TASKS, isPro: false };
    }

    const remaining = Math.max(0, MAX_FREE_DAILY_TASKS - record.count);
    return { count: record.count, remaining, max: MAX_FREE_DAILY_TASKS, isPro: false };
  } catch {
    return { count: 0, remaining: MAX_FREE_DAILY_TASKS, max: MAX_FREE_DAILY_TASKS, isPro: false };
  }
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
  const raw = localStorage.getItem(DAILY_LIMIT_KEY);
  let currentCount = 0;

  if (raw) {
    try {
      const record: DailyUsageRecord = JSON.parse(raw);
      if (record.date === today) {
        currentCount = record.count;
      }
    } catch {
      currentCount = 0;
    }
  }

  localStorage.setItem(DAILY_LIMIT_KEY, JSON.stringify({ date: today, count: currentCount + 1 }));
}