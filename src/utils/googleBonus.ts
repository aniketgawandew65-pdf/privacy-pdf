import { safeStorage } from './safeStorage';

const ACTIVE_ACCOUNT_KEY =
  'oneintoone_google_bonus_active_v1';

const LOGOUT_PENDING_KEY =
  'oneintoone_google_bonus_logout_pending_v1';

const CACHE_PREFIX =
  'oneintoone_google_bonus_v1:';

export const GOOGLE_BONUS_MAX = 2;
export const GOOGLE_BONUS_FILE_SIZE_MB = 25;

const OFFLINE_SESSION_DAYS = 30;
const CHANGE_EVENT =
  'oneintoone:google-bonus-changed';

export interface GoogleBonusState {
  accountKey: string;
  email: string;
  bonusUsed: number;
  bonusRemaining: number;
  pendingSync: boolean;
  expiresAt: string;
}

interface StoredGoogleBonus {
  accountKey: string;
  email: string;
  bonusUsed: number;
  pendingSync: boolean;
  expiresAt: string;
  updatedAt: string;
}

function clampBonusUsed(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(
    GOOGLE_BONUS_MAX,
    Math.max(0, Math.floor(parsed))
  );
}

function cacheKey(accountKey: string): string {
  return `${CACHE_PREFIX}${accountKey}`;
}

function notifyChange(): void {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent(CHANGE_EVENT)
  );
}

function parseStored(
  raw: string | null
): StoredGoogleBonus | null {
  if (!raw) return null;

  try {
    const value = JSON.parse(raw);

    if (
      !value ||
      typeof value.accountKey !== 'string' ||
      typeof value.email !== 'string' ||
      typeof value.expiresAt !== 'string'
    ) {
      return null;
    }

    return {
      accountKey: value.accountKey,
      email: value.email,
      bonusUsed: clampBonusUsed(
        value.bonusUsed
      ),
      pendingSync:
        value.pendingSync === true,
      expiresAt: value.expiresAt,
      updatedAt:
        typeof value.updatedAt === 'string'
          ? value.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function saveStored(
  record: StoredGoogleBonus
): void {
  safeStorage.setItem(
    cacheKey(record.accountKey),
    JSON.stringify(record)
  );
}

function toPublicState(
  record: StoredGoogleBonus
): GoogleBonusState {
  return {
    accountKey: record.accountKey,
    email: record.email,
    bonusUsed: record.bonusUsed,
    bonusRemaining: Math.max(
      0,
      GOOGLE_BONUS_MAX -
        record.bonusUsed
    ),
    pendingSync: record.pendingSync,
    expiresAt: record.expiresAt,
  };
}

export function getActiveGoogleBonus():
  GoogleBonusState | null {
  const accountKey =
    safeStorage.getItem(
      ACTIVE_ACCOUNT_KEY
    );

  if (!accountKey) return null;

  const stored = parseStored(
    safeStorage.getItem(
      cacheKey(accountKey)
    )
  );

  if (!stored) {
    safeStorage.removeItem(
      ACTIVE_ACCOUNT_KEY
    );
    return null;
  }

  const expires =
    new Date(
      stored.expiresAt
    ).getTime();

  if (
    !Number.isFinite(expires) ||
    expires <= Date.now()
  ) {
    // Stop offline entitlement after the
    // login/session lifetime. Keep the
    // per-account record so a future
    // online login can safely reconcile
    // local usage with D1.
    safeStorage.removeItem(
      ACTIVE_ACCOUNT_KEY
    );
    notifyChange();
    return null;
  }

  return toPublicState(stored);
}

export function applyGoogleLogin(
  input: {
    accountKey: string;
    email: string;
    bonusUsed: number;
  }
): GoogleBonusState {
  // A fresh successful Google login replaces any
  // previously queued offline logout.
  safeStorage.removeItem(
    LOGOUT_PENDING_KEY
  );

  const serverUsed =
    clampBonusUsed(
      input.bonusUsed
    );

  const existing =
    parseStored(
      safeStorage.getItem(
        cacheKey(input.accountKey)
      )
    );

  // Never let a stale server/browser copy
  // restore an already-consumed bonus.
  const mergedUsed = Math.max(
    serverUsed,
    existing?.bonusUsed ?? 0
  );

  const record: StoredGoogleBonus = {
    accountKey: input.accountKey,
    email: input.email,
    bonusUsed: mergedUsed,
    pendingSync:
      mergedUsed > serverUsed,
    expiresAt: new Date(
      Date.now() +
        OFFLINE_SESSION_DAYS *
          24 *
          60 *
          60 *
          1000
    ).toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  saveStored(record);

  safeStorage.setItem(
    ACTIVE_ACCOUNT_KEY,
    input.accountKey
  );

  notifyChange();

  return toPublicState(record);
}

export function consumeGoogleBonus():
  GoogleBonusState | null {
  const active =
    getActiveGoogleBonus();

  if (
    !active ||
    active.bonusRemaining <= 0
  ) {
    return null;
  }

  const record: StoredGoogleBonus = {
    accountKey:
      active.accountKey,
    email:
      active.email,
    bonusUsed:
      clampBonusUsed(
        active.bonusUsed + 1
      ),
    pendingSync: true,
    expiresAt:
      active.expiresAt,
    updatedAt:
      new Date().toISOString(),
  };

  saveStored(record);
  notifyChange();

  // Processing can continue immediately.
  // Network sync happens separately.
  void syncGoogleBonusUsage();

  return toPublicState(record);
}

export async function syncGoogleBonusUsage():
  Promise<GoogleBonusState | null> {
  const active =
    getActiveGoogleBonus();

  if (!active) {
    return null;
  }

  if (!active.pendingSync) {
    return active;
  }

  try {
    const response = await fetch(
      '/api/bonus/sync',
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type':
            'application/json',
        },
        body: JSON.stringify({
          bonusUsed:
            active.bonusUsed,
        }),
      }
    );

    if (!response.ok) {
      return active;
    }

    const data = await response.json();

    const serverUsed =
      clampBonusUsed(
        data?.bonusUsed
      );

    const mergedUsed =
      Math.max(
        active.bonusUsed,
        serverUsed
      );

    const record: StoredGoogleBonus = {
      accountKey:
        active.accountKey,
      email:
        active.email,
      bonusUsed:
        mergedUsed,
      pendingSync: false,
      expiresAt:
        active.expiresAt,
      updatedAt:
        new Date().toISOString(),
    };

    saveStored(record);
    notifyChange();

    return toPublicState(record);
  } catch {
    // Expected while offline.
    // The local entitlement remains usable,
    // and the next online restore/login can
    // synchronize it.
    return active;
  }
}

export async function restoreGoogleSession():
  Promise<GoogleBonusState | null> {
  /*
   * If the user deliberately logged out while offline,
   * do NOT restore the old cached/server account.
   *
   * First chance we get online, clear the old HttpOnly
   * cookie on the server and remain signed out.
   */
  if (
    safeStorage.getItem(
      LOGOUT_PENDING_KEY
    ) === '1'
  ) {
    try {
      const logoutResponse = await fetch(
        '/api/auth/logout',
        {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
        }
      );

      if (logoutResponse.ok) {
        safeStorage.removeItem(
          LOGOUT_PENDING_KEY
        );
      }
    } catch {
      // Still offline. Remain locally signed out.
    }

    return null;
  }

  try {
    const response = await fetch(
      '/api/auth/session',
      {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      return getActiveGoogleBonus();
    }

    const data = await response.json();

    if (
      !data?.signedIn ||
      typeof data.accountKey !==
        'string' ||
      typeof data.email !==
        'string'
    ) {
      return getActiveGoogleBonus();
    }

    const state = applyGoogleLogin({
      accountKey:
        data.accountKey,
      email:
        data.email,
      bonusUsed:
        data.bonusUsed,
    });

    if (state.pendingSync) {
      return (
        (await syncGoogleBonusUsage()) ??
        state
      );
    }

    return state;
  } catch {
    // No internet: use the previously
    // verified Google entitlement locally.
    return getActiveGoogleBonus();
  }
}

export async function logoutGoogleBonus():
  Promise<void> {
  /*
   * Stop local bonus access immediately, even if the
   * device currently has no internet connection.
   */
  safeStorage.removeItem(
    ACTIVE_ACCOUNT_KEY
  );

  /*
   * Keep a logout tombstone until the server confirms
   * that the HttpOnly cookie has been cleared.
   */
  safeStorage.setItem(
    LOGOUT_PENDING_KEY,
    '1'
  );

  notifyChange();

  try {
    const response = await fetch(
      '/api/auth/logout',
      {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
      }
    );

    if (response.ok) {
      safeStorage.removeItem(
        LOGOUT_PENDING_KEY
      );
    }
  } catch {
    /*
     * Expected when offline.
     * The tombstone remains, so the old account cannot
     * silently come back when the app is reopened.
     */
  }
}

export function subscribeGoogleBonus(
  listener: () => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = () =>
    listener();

  window.addEventListener(
    CHANGE_EVENT,
    handler
  );

  window.addEventListener(
    'storage',
    handler
  );

  return () => {
    window.removeEventListener(
      CHANGE_EVENT,
      handler
    );

    window.removeEventListener(
      'storage',
      handler
    );
  };
}
