import { safeStorage, safeSessionStorage } from './safeStorage';
import { getLicenseStatus } from './license';
import {
  isMobileSafetyEnvironment,
} from './deviceCapability';
import {
  GOOGLE_BONUS_FILE_SIZE_MB,
  consumeGoogleBonus,
  getActiveGoogleBonus,
} from './googleBonus';

const DAILY_LIMIT_KEY = 'oneintoone_daily_usage';
const MAX_FREE_DAILY_TASKS = 2;
export const MAX_FREE_FILE_SIZE_MB = 100;
export const MAX_GOOGLE_BONUS_FILE_SIZE_MB = GOOGLE_BONUS_FILE_SIZE_MB;
export const MAX_PRO_FILE_SIZE_MB = 150;

export type TaskCreditTier =
  | 'pro'
  | 'anonymous'
  | 'google';

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

export function getDailyUsage(): {
  count: number;
  remaining: number;
  max: number;
  isPro: boolean;
  tier: 'pro' | 'anonymous' | 'google';
  anonymousRemaining: number;
  bonusRemaining: number;
} {
  const { isPro } = getLicenseStatus();

  if (isPro) {
    return {
      count: 0,
      remaining: Infinity,
      max: Infinity,
      isPro: true,
      tier: 'pro',
      anonymousRemaining: Infinity,
      bonusRemaining: Infinity,
    };
  }

  const today = getTodayString();
  const record = readUsage(today);
  const anonymousRemaining = Math.max(
    0,
    MAX_FREE_DAILY_TASKS - record.count
  );

  if (anonymousRemaining > 0) {
    return {
      count: record.count,
      remaining: anonymousRemaining,
      max: MAX_FREE_DAILY_TASKS,
      isPro: false,
      tier: 'anonymous',
      anonymousRemaining,
      bonusRemaining:
        getActiveGoogleBonus()?.bonusRemaining ?? 0,
    };
  }

  const google = getActiveGoogleBonus();
  const bonusRemaining = google?.bonusRemaining ?? 0;

  return {
    count: google?.bonusUsed ?? 0,
    remaining: bonusRemaining,
    max: google ? 2 : 0,
    isPro: false,
    tier: google ? 'google' : 'anonymous',
    anonymousRemaining: 0,
    bonusRemaining,
  };
}

export function checkActionAllowed(fileSizeBytes?: number): {
  allowed: boolean;
  reason?: 'DAILY_LIMIT' | 'FILE_SIZE_LIMIT';
  errorMessage?: string;
  creditTier?: TaskCreditTier;
} {
  const { isPro } = getLicenseStatus();

  const mobileSafetyEnvironment =
    isMobileSafetyEnvironment();

  const sizeInMb =
    fileSizeBytes === undefined
      ? undefined
      : fileSizeBytes / (1024 * 1024);

  if (isPro) {
    /*
     * Mobile/tablet Pro retains the hard 150 MB combined
     * task ceiling.
     *
     * Desktop Pro has no fixed task-credit size ceiling.
     * Actual Desktop processing capacity is handled by the
     * separate hardware/browser/tool-aware recommendation
     * system and later concrete resource checks.
     */
    if (
      mobileSafetyEnvironment &&
      sizeInMb !== undefined &&
      sizeInMb > MAX_PRO_FILE_SIZE_MB
    ) {
      return {
        allowed: false,
        reason: 'FILE_SIZE_LIMIT',
        errorMessage:
          `Mobile and tablet Pro support up to ${MAX_PRO_FILE_SIZE_MB}MB per task.`,
      };
    }

    return {
      allowed: true,
      creditTier: 'pro',
    };
  }

  const usage = getDailyUsage();
  const bonusAccount =
    getActiveGoogleBonus();

  const bonusRemaining =
    bonusAccount?.bonusRemaining ?? 0;

  const proSizeUpgradeMessage =
    mobileSafetyEnvironment
      ? `Upgrade to Pro for files up to ${MAX_PRO_FILE_SIZE_MB}MB.`
      : 'Upgrade to Desktop Pro for hardware-aware processing with no fixed upload-size cap.';

  /*
   * Anything above 150 MB requires Pro.
   */
  if (
    sizeInMb !== undefined &&
    sizeInMb > MAX_GOOGLE_BONUS_FILE_SIZE_MB
  ) {
    return {
      allowed: false,
      reason: 'FILE_SIZE_LIMIT',
      errorMessage:
        bonusAccount
          ? `Extra credits support files up to ${MAX_GOOGLE_BONUS_FILE_SIZE_MB}MB. ` +
            proSizeUpgradeMessage
          : `No-signup free tasks support files up to ${MAX_FREE_FILE_SIZE_MB}MB. ` +
            `Sign in to unlock 2 more credits up to ${MAX_GOOGLE_BONUS_FILE_SIZE_MB}MB. ` +
            proSizeUpgradeMessage,
    };
  }

  /*
   * Files above 100 MB can NEVER consume a daily anonymous
   * credit. They require an available bonus credit.
   */
  if (
    sizeInMb !== undefined &&
    sizeInMb > MAX_FREE_FILE_SIZE_MB
  ) {
    if (bonusRemaining > 0) {
      return {
        allowed: true,
        creditTier: 'google',
      };
    }

    return {
      allowed: false,
      reason: 'FILE_SIZE_LIMIT',
      errorMessage:
        bonusAccount
          ? `Your extra credits are used up. Daily free tasks support files up to ${MAX_FREE_FILE_SIZE_MB}MB. ` +
            proSizeUpgradeMessage
          : `No-signup free tasks support files up to ${MAX_FREE_FILE_SIZE_MB}MB. ` +
            `Sign in to unlock 2 more credits up to ${MAX_GOOGLE_BONUS_FILE_SIZE_MB}MB.`,
    };
  }

  /*
   * Files up to 100 MB consume daily credits first.
   */
  if (usage.anonymousRemaining > 0) {
    return {
      allowed: true,
      creditTier: 'anonymous',
    };
  }

  /*
   * Once daily credits are gone, bonus credits can also
   * handle files up to 100 MB.
   */
  if (bonusRemaining > 0) {
    return {
      allowed: true,
      creditTier: 'google',
    };
  }

  return {
    allowed: false,
    reason: 'DAILY_LIMIT',
    errorMessage:
      bonusAccount
        ? 'You have used all available free credits. Upgrade to Pro to continue.'
        : `You have used today's ${MAX_FREE_DAILY_TASKS} free tasks. Sign in to unlock 2 more credits.`,
  };
}

export function recordActionExecution(
  creditTier?: TaskCreditTier
): void {
  const { isPro } = getLicenseStatus();

  if (
    isPro ||
    creditTier === 'pro'
  ) {
    return;
  }

  const today = getTodayString();
  const record = readUsage(today);

  /*
   * When the gate selected the bonus tier, consume the
   * account-specific bonus credit directly.
   */
  if (creditTier === 'google') {
    const google =
      getActiveGoogleBonus();

    if (
      google &&
      google.bonusRemaining > 0
    ) {
      consumeGoogleBonus();
    }

    return;
  }

  /*
   * When the gate selected the daily tier, consume only
   * the daily credit.
   */
  if (creditTier === 'anonymous') {
    if (
      record.count <
      MAX_FREE_DAILY_TASKS
    ) {
      persistUsage({
        date: today,
        count: record.count + 1,
      });
    }

    return;
  }

  /*
   * Backward-safe fallback for any legacy caller that
   * commits without an explicit checked tier.
   */
  if (
    record.count <
    MAX_FREE_DAILY_TASKS
  ) {
    persistUsage({
      date: today,
      count: record.count + 1,
    });

    return;
  }

  const google =
    getActiveGoogleBonus();

  if (
    google &&
    google.bonusRemaining > 0
  ) {
    consumeGoogleBonus();
  }
}
