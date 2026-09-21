import {
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  LogOut,
  WifiOff,
  Gift,
  Loader2,
} from 'lucide-react';

import {
  applyGoogleLogin,
  getActiveGoogleBonus,
  logoutGoogleBonus,
  restoreGoogleSession,
  subscribeGoogleBonus,
  type GoogleBonusState,
} from '../utils/googleBonus';
import {
  trackAnalyticsEvent,
} from '../utils/analytics';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: {
            client_id: string;
            callback: (response: {
              credential?: string;
            }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, unknown>
          ) => void;
          disableAutoSelect?: () => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '760719022510-33gc9or94u0q7m07vv57h5g3nppkf7n3.apps.googleusercontent.com';

const GOOGLE_SCRIPT_ID =
  'oneintoone-google-identity';

function loadGoogleIdentity():
  Promise<void> {
  return new Promise(
    (resolve, reject) => {
      if (
        window.google?.accounts?.id
      ) {
        resolve();
        return;
      }

      const existing =
        document.getElementById(
          GOOGLE_SCRIPT_ID
        ) as HTMLScriptElement | null;

      if (existing) {
        existing.addEventListener(
          'load',
          () => resolve(),
          { once: true }
        );

        existing.addEventListener(
          'error',
          () =>
            reject(
              new Error(
                'Google sign-in failed to load.'
              )
            ),
          { once: true }
        );

        return;
      }

      const script =
        document.createElement(
          'script'
        );

      script.id =
        GOOGLE_SCRIPT_ID;

      script.src =
        'https://accounts.google.com/gsi/client';

      script.async = true;
      script.defer = true;

      script.onload =
        () => resolve();

      script.onerror =
        () =>
          reject(
            new Error(
              'Google sign-in failed to load.'
            )
          );

      document.head.appendChild(
        script
      );
    }
  );
}

export function GoogleBonusAccount() {
  const buttonRef =
    useRef<HTMLDivElement>(
      null
    );

  const initializedRef =
    useRef(false);

  const [account, setAccount] =
    useState<GoogleBonusState | null>(
      () =>
        getActiveGoogleBonus()
    );

  const [online, setOnline] =
    useState(
      typeof navigator ===
        'undefined'
        ? true
        : navigator.onLine
    );

  const [loading, setLoading] =
    useState(true);

  const [authError, setAuthError] =
    useState<string | null>(
      null
    );

  const refreshLocalState =
    () => {
      setAccount(
        getActiveGoogleBonus()
      );
    };

  useEffect(() => {
    const unsubscribe =
      subscribeGoogleBonus(
        refreshLocalState
      );

    const handleOnline =
      () => {
        setOnline(true);

        void restoreGoogleSession()
          .then((state) => {
            setAccount(state);
          });
      };

    const handleOffline =
      () => {
        setOnline(false);
        refreshLocalState();
      };

    window.addEventListener(
      'online',
      handleOnline
    );

    window.addEventListener(
      'offline',
      handleOffline
    );

    void restoreGoogleSession()
      .then((state) => {
        setAccount(state);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => {
      unsubscribe();

      window.removeEventListener(
        'online',
        handleOnline
      );

      window.removeEventListener(
        'offline',
        handleOffline
      );
    };
  }, []);

  useEffect(() => {
    if (
      account ||
      !online ||
      loading
    ) {
      return;
    }

    let cancelled = false;

    const setup = async () => {
      try {
        setAuthError(null);

        await loadGoogleIdentity();

        if (
          cancelled ||
          !buttonRef.current ||
          !window.google
            ?.accounts
            ?.id
        ) {
          return;
        }

        if (
          !initializedRef.current
        ) {
          window.google.accounts.id.initialize({
            client_id:
              GOOGLE_CLIENT_ID,

            auto_select: false,

            cancel_on_tap_outside:
              true,

            callback: async (
              googleResponse
            ) => {
              const credential =
                googleResponse
                  ?.credential;

              if (!credential) {
                setAuthError(
                  'Google sign-in did not return a valid account.'
                );
                return;
              }

              setLoading(true);
              setAuthError(null);

              try {
                const response =
                  await fetch(
                    '/api/auth/google',
                    {
                      method:
                        'POST',

                      credentials:
                        'same-origin',

                      headers: {
                        'Content-Type':
                          'application/json',
                      },

                      body:
                        JSON.stringify({
                          credential,
                        }),
                    }
                  );

                const data =
                  await response.json();

                if (
                  !response.ok ||
                  !data?.ok
                ) {
                  throw new Error(
                    data?.error ||
                      'Google sign-in failed.'
                  );
                }

                if (
                  typeof data.accountKey !==
                    'string' ||
                  typeof data.email !==
                    'string'
                ) {
                  throw new Error(
                    'Invalid account response.'
                  );
                }

                const state =
                  applyGoogleLogin({
                    accountKey:
                      data.accountKey,

                    email:
                      data.email,

                    bonusUsed:
                      data.bonusUsed,
                  });

                setAccount(state);

                trackAnalyticsEvent(
                  'google_sign_in',
                  {
                    auth_method:
                      'google',
                  }
                );
              } catch (
                error
              ) {
                setAuthError(
                  error instanceof
                    Error
                    ? error.message
                    : 'Google sign-in failed.'
                );
              } finally {
                setLoading(false);
              }
            },
          });

          initializedRef.current =
            true;
        }

        buttonRef.current.innerHTML =
          '';

        window.google.accounts.id.renderButton(
          buttonRef.current,
          {
            type: 'standard',
            theme: 'outline',
            size: 'medium',
            text: 'continue_with',
            shape: 'pill',
          }
        );
      } catch (error) {
        if (!cancelled) {
          setAuthError(
            error instanceof Error
              ? error.message
              : 'Google sign-in unavailable.'
          );
        }
      }
    };

    void setup();

    return () => {
      cancelled = true;
    };
  }, [
    account,
    online,
    loading,
  ]);

  const handleLogout =
    async () => {
      setLoading(true);
      setAuthError(null);

      try {
        window.google
          ?.accounts
          ?.id
          ?.disableAutoSelect?.();

        await logoutGoogleBonus();

        setAccount(null);
      } finally {
        setLoading(false);
      }
    };

  if (loading && !account) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <Loader2
          size={14}
          className="animate-spin"
        />
        Checking account…
      </div>
    );
  }

  if (account) {
    return (
      <div className="google-account-signed-in flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/80 px-3 py-1.5">
          <Gift
            size={14}
            className="text-emerald-400"
          />

          <div className="leading-tight">
            <div className="max-w-[170px] truncate text-[11px] text-zinc-300">
              {account.email}
            </div>

            <div className="text-[10px] text-emerald-400">
              {account.bonusRemaining} task
              {account.bonusRemaining ===
              1
                ? ''
                : 's'}{' '}
              left · up to 150 MB
            </div>
          </div>

          {!online && (
            <WifiOff
              size={13}
              className="text-zinc-500"
              aria-label="Offline"
            />
          )}
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={loading}
          className="google-logout-button"
          title="Log out or switch Google account"
        >
          {loading ? (
            <Loader2
              size={13}
              className="animate-spin"
            />
          ) : (
            <LogOut size={13} />
          )}

          <span className="hidden md:inline">
            Log out
          </span>
        </button>
      </div>
    );
  }

  if (!online) {
    return (
      <div
        className="flex items-center gap-1.5 text-xs text-zinc-500"
        title="Internet is required only for Google sign-in"
      >
        <WifiOff size={14} />
        Sign in when online
      </div>
    );
  }

  return (
    <div className="google-account-login flex flex-col items-end gap-1">
      <div ref={buttonRef} />

      <span className="text-[10px] text-zinc-500">
        2 extra tasks · files up to 150 MB
      </span>

      {authError && (
        <span
          role="alert"
          className="max-w-[240px] text-right text-[10px] text-red-400"
        >
          {authError}
        </span>
      )}
    </div>
  );
}
