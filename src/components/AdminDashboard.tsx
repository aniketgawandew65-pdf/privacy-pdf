import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  BadgeDollarSign,
  CheckCircle2,
  CircleAlert,
  RefreshCw,
  ShoppingCart,
  UserRound,
  Users,
  Webhook,
} from 'lucide-react';

type Purchase = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  productName: string;
  variantName: string;
  amountCents: number;
  currency: string;
  status: string;
  refunded: boolean;
  purchasedAt: string;
};

type GoogleUser = {
  email: string;
  bonusUsed: number;
  marketingOptIn: boolean;
  createdAt: string;
  updatedAt: string;
};

type WebhookEvent = {
  eventName: string;
  customerEmail: string;
  amountCents: number;
  currency: string;
  status: string;
  eventAt: string;
};

type DashboardData = {
  ok: boolean;
  previewMode: boolean;
  webhookConfigured: boolean;
  adminEmail?: string | null;
  stats: {
    totalPurchases: number;
    grossRevenueCents: number;
    currency: string;
    googleUsers: number;
    purchasesThisMonth: number;
  };
  purchases: Purchase[];
  googleUsers: GoogleUser[];
  events: WebhookEvent[];
};

const formatMoney = (
  cents: number,
  currency: string
) => {
  try {
    return new Intl.NumberFormat(
      undefined,
      {
        style: 'currency',
        currency:
          currency || 'USD',
        maximumFractionDigits: 2,
      }
    ).format(
      cents / 100
    );
  } catch {
    return `${(
      cents / 100
    ).toFixed(2)} ${currency}`;
  }
};

const formatDate = (
  value: string
) => {
  if (!value) return '—';

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: 'medium',
      timeStyle: 'short',
    }
  ).format(date);
};

const badgeClass = (
  status: string,
  refunded = false
) => {
  if (refunded) {
    return 'bg-amber-100 text-amber-900 border-amber-300';
  }

  const clean =
    status
      .toLowerCase();

  if (
    clean.includes('paid') ||
    clean.includes('active') ||
    clean.includes('success')
  ) {
    return 'bg-emerald-100 text-emerald-900 border-emerald-300';
  }

  return 'bg-[#f4f4f5] text-[#3f3f46] border-[#d4d4d8]';
};

export function AdminDashboard() {
  const [
    data,
    setData,
  ] =
    useState<DashboardData | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  const load =
    useCallback(
      async () => {
        setLoading(true);
        setError(null);

        try {
          const response =
            await fetch(
              '/api/admin/dashboard',
              {
                credentials:
                  'same-origin',
                cache:
                  'no-store',
              }
            );

          const payload =
            await response.json();

          if (
            !response.ok ||
            !payload?.ok
          ) {
            throw new Error(
              payload?.error ||
                'Unable to load admin dashboard.'
            );
          }

          setData(
            payload
          );
        } catch (
          caught
        ) {
          setData(null);
          setError(
            caught instanceof
              Error
              ? caught.message
              : 'Unable to load admin dashboard.'
          );
        } finally {
          setLoading(false);
        }
      },
      []
    );

  useEffect(
    () => {
      void load();
    },
    [load]
  );

  useEffect(() => {
    document.title =
      '1into1 Admin';

    let robots =
      document.querySelector<HTMLMetaElement>(
        'meta[name="robots"]'
      );

    if (!robots) {
      robots =
        document.createElement(
          'meta'
        );

      robots.name =
        'robots';

      document.head.appendChild(
        robots
      );
    }

    robots.content =
      'noindex,nofollow';

    return () => {
      robots?.setAttribute(
        'content',
        'index,follow'
      );
    };
  }, []);

  const latestPurchase =
    useMemo(
      () =>
        data?.purchases?.[0] ||
        null,
      [data]
    );

  if (loading) {
    return (
      <div className="w-full rounded-2xl border border-[#d4d4d8] bg-white p-8 text-center text-zinc-700">
        <RefreshCw className="mx-auto h-6 w-6 animate-spin" />
        <p className="mt-3 text-sm font-semibold">
          Loading 1into1 Admin…
        </p>
      </div>
    );
  }

  if (
    error ||
    !data
  ) {
    return (
      <div className="w-full rounded-2xl border border-red-300 bg-white p-6 text-left">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">
              Admin access required
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-700">
              {error ||
                'Unable to load the dashboard.'}
            </p>
            <p className="mt-2 text-xs leading-5 text-zinc-600">
              Sign in with the authorized Google account from the header, then refresh this dashboard.
            </p>
            <button
              type="button"
              onClick={() =>
                void load()
              }
              className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#202023] bg-[#202023] px-4 text-sm font-semibold"
              style={{
                color: '#ffffff',
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const cards = [
    {
      label:
        'Total purchases',
      value:
        data.stats
          .totalPurchases,
      icon:
        ShoppingCart,
    },
    {
      label:
        'Gross revenue',
      value:
        formatMoney(
          data.stats
            .grossRevenueCents,
          data.stats.currency
        ),
      icon:
        BadgeDollarSign,
    },
    {
      label:
        'This month',
      value:
        data.stats
          .purchasesThisMonth,
      icon:
        CheckCircle2,
    },
    {
      label:
        'Google users',
      value:
        data.stats
          .googleUsers,
      icon:
        Users,
    },
  ];

  return (
    <div className="w-full space-y-5" style={{ color: '#202023' }}>
      <section className="rounded-2xl border border-[#d4d4d8] bg-white p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">
              1into1 Admin
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
              Revenue & user dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Purchases from Lemon Squeezy and signed-in Google users in one private view.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void load()
            }
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d4d4d8] bg-white px-4 text-sm font-semibold hover:bg-[#f4f4f5]"
            style={{ color: '#202023' }}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {data.previewMode && (
          <div className="mt-5 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-950">
            <strong>
              Preview mode.
            </strong>{' '}
            The rows below are sample data only. No real customer information is exposed on branch previews.
          </div>
        )}

        {!data.previewMode && (
          <div className="mt-5 flex flex-wrap gap-2 text-xs text-zinc-600">
            {data.adminEmail && (
              <span className="rounded-full border border-[#d4d4d8] px-3 py-1.5"
                style={{ backgroundColor: '#f7f7f8', color: '#52525b' }}>
                Admin: {data.adminEmail}
              </span>
            )}
            <span
              className={`rounded-full border px-3 py-1.5 ${
                data.webhookConfigured
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                  : 'border-amber-300 bg-amber-50 text-amber-900'
              }`}
            >
              Lemon webhook{' '}
              {data.webhookConfigured
                ? 'configured'
                : 'not configured'}
            </span>
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(
          ({
            label,
            value,
            icon: Icon,
          }) => (
            <article
              key={label}
              className="rounded-2xl border border-[#d4d4d8] bg-white p-5"
            >
              <Icon className="h-5 w-5 text-emerald-800" />
              <div className="mt-5 text-2xl font-semibold text-zinc-950">
                {value}
              </div>
              <div className="mt-1 text-xs font-medium text-zinc-600">
                {label}
              </div>
            </article>
          )
        )}
      </section>

      {latestPurchase && (
        <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-800" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-emerald-900">
                Latest purchase
              </div>
              <div className="mt-1 text-base font-semibold text-zinc-950">
                {latestPurchase.customerEmail ||
                  'Customer'}{' '}
                ·{' '}
                {formatMoney(
                  latestPurchase.amountCents,
                  latestPurchase.currency
                )}
              </div>
              <div className="mt-1 text-xs text-zinc-700">
                {formatDate(
                  latestPurchase.purchasedAt
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-[#d4d4d8] bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">
              Purchases
            </h2>
            <p className="mt-1 text-xs text-zinc-600">
              Most recent Lemon Squeezy orders.
            </p>
          </div>
          <ShoppingCart className="h-5 w-5 text-zinc-500" />
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-[#e4e4e7]">
          <table className="min-w-full text-left text-xs">
            <thead style={{ backgroundColor: '#f4f4f5', color: '#3f3f46' }}>
              <tr>
                <th className="px-3 py-3 font-semibold">
                  Customer
                </th>
                <th className="px-3 py-3 font-semibold">
                  Product
                </th>
                <th className="px-3 py-3 font-semibold">
                  Amount
                </th>
                <th className="px-3 py-3 font-semibold">
                  Status
                </th>
                <th className="px-3 py-3 font-semibold">
                  Order
                </th>
                <th className="px-3 py-3 font-semibold">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {data.purchases.length ===
              0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-zinc-500"
                  >
                    No purchases recorded yet.
                  </td>
                </tr>
              ) : (
                data.purchases.map(
                  (purchase) => (
                    <tr
                      key={
                        purchase.orderId
                      }
                      className="border-t border-[#e4e4e7] text-zinc-800"
                    >
                      <td className="px-3 py-3">
                        <div className="font-medium text-zinc-950">
                          {purchase.customerName ||
                            '—'}
                        </div>
                        <div className="mt-0.5 text-zinc-600">
                          {purchase.customerEmail ||
                            '—'}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div>
                          {purchase.productName ||
                            '1into1 PDF'}
                        </div>
                        <div className="mt-0.5 text-zinc-500">
                          {purchase.variantName ||
                            '—'}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-semibold">
                        {formatMoney(
                          purchase.amountCents,
                          purchase.currency
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-1 font-medium ${badgeClass(
                            purchase.status,
                            purchase.refunded
                          )}`}
                        >
                          {purchase.refunded
                            ? 'refunded'
                            : purchase.status ||
                              'received'}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        #
                        {purchase.orderNumber ||
                          purchase.orderId}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-zinc-600">
                        {formatDate(
                          purchase.purchasedAt
                        )}
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-[#d4d4d8] bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">
              Google users
            </h2>
            <p className="mt-1 text-xs text-zinc-600">
              Accounts that used Google sign-in for extra task credits.
            </p>
          </div>
          <UserRound className="h-5 w-5 text-zinc-500" />
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-[#e4e4e7]">
          <table className="min-w-full text-left text-xs">
            <thead style={{ backgroundColor: '#f4f4f5', color: '#3f3f46' }}>
              <tr>
                <th className="px-3 py-3 font-semibold">
                  Email
                </th>
                <th className="px-3 py-3 font-semibold">
                  Bonus used
                </th>
                <th className="px-3 py-3 font-semibold">
                  Marketing
                </th>
                <th className="px-3 py-3 font-semibold">
                  First sign-in
                </th>
                <th className="px-3 py-3 font-semibold">
                  Last update
                </th>
              </tr>
            </thead>
            <tbody>
              {data.googleUsers.length ===
              0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-zinc-500"
                  >
                    No Google users recorded yet.
                  </td>
                </tr>
              ) : (
                data.googleUsers.map(
                  (user) => (
                    <tr
                      key={
                        user.email
                      }
                      className="border-t border-[#e4e4e7] text-zinc-800"
                    >
                      <td className="px-3 py-3 font-medium text-zinc-950">
                        {user.email}
                      </td>
                      <td className="px-3 py-3">
                        {user.bonusUsed}/2
                      </td>
                      <td className="px-3 py-3">
                        {user.marketingOptIn
                          ? 'Yes'
                          : 'No'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-zinc-600">
                        {formatDate(
                          user.createdAt
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-zinc-600">
                        {formatDate(
                          user.updatedAt
                        )}
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-[#d4d4d8] bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">
              Recent payment events
            </h2>
            <p className="mt-1 text-xs text-zinc-600">
              Webhook activity received from Lemon Squeezy.
            </p>
          </div>
          <Webhook className="h-5 w-5 text-zinc-500" />
        </div>

        <div className="mt-4 space-y-2">
          {data.events.length ===
          0 ? (
            <div className="rounded-xl border border-[#e4e4e7] p-4 text-xs"
              style={{ backgroundColor: '#f7f7f8', color: '#52525b' }}>
              No Lemon Squeezy events received yet.
            </div>
          ) : (
            data.events.map(
              (
                event,
                index
              ) => (
                <div
                  key={`${event.eventName}-${event.eventAt}-${index}`}
                  className="flex flex-col gap-2 rounded-xl border border-[#e4e4e7] p-3 sm:flex-row sm:items-center sm:justify-between"
                  style={{ backgroundColor: '#f7f7f8', color: '#27272a' }}
                >
                  <div>
                    <div className="text-xs font-semibold text-zinc-950">
                      {event.eventName}
                    </div>
                    <div className="mt-1 text-xs text-zinc-600">
                      {event.customerEmail ||
                        'No customer email'}
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    {event.amountCents >
                      0 && (
                      <div className="text-xs font-semibold text-zinc-950">
                        {formatMoney(
                          event.amountCents,
                          event.currency
                        )}
                      </div>
                    )}
                    <div className="mt-1 text-[11px] text-zinc-500">
                      {formatDate(
                        event.eventAt
                      )}
                    </div>
                  </div>
                </div>
              )
            )
          )}
        </div>
      </section>
    </div>
  );
}

export default AdminDashboard;
