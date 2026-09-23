import {
  ensureAdminTables,
  requireAdmin,
} from './_admin.js';

import {
  json,
} from '../_session.js';

const previewPayload = {
  ok: true,
  previewMode: true,
  webhookConfigured: false,
  stats: {
    totalPurchases: 3,
    grossRevenueCents: 8700,
    currency: 'USD',
    googleUsers: 12,
    purchasesThisMonth: 2,
  },
  purchases: [
    {
      orderId: 'preview-1003',
      orderNumber: '1003',
      customerName: 'Preview Customer',
      customerEmail: 'customer@example.com',
      productName: '1into1 PDF Pro',
      variantName: 'Lifetime',
      amountCents: 3900,
      currency: 'USD',
      status: 'paid',
      refunded: false,
      purchasedAt: new Date().toISOString(),
    },
    {
      orderId: 'preview-1002',
      orderNumber: '1002',
      customerName: 'Sample Buyer',
      customerEmail: 'buyer@example.com',
      productName: '1into1 PDF Pro',
      variantName: 'Monthly',
      amountCents: 2400,
      currency: 'USD',
      status: 'paid',
      refunded: false,
      purchasedAt: new Date(
        Date.now() -
          86400000 * 3
      ).toISOString(),
    },
  ],
  googleUsers: [
    {
      email: 'signedin.user@example.com',
      bonusUsed: 1,
      marketingOptIn: false,
      createdAt: new Date(
        Date.now() -
          86400000 * 8
      ).toISOString(),
      updatedAt: new Date(
        Date.now() -
          3600000 * 2
      ).toISOString(),
    },
    {
      email: 'another.user@example.com',
      bonusUsed: 2,
      marketingOptIn: true,
      createdAt: new Date(
        Date.now() -
          86400000 * 14
      ).toISOString(),
      updatedAt: new Date(
        Date.now() -
          86400000
      ).toISOString(),
    },
  ],
  events: [
    {
      eventName: 'order_created',
      customerEmail: 'customer@example.com',
      amountCents: 3900,
      currency: 'USD',
      status: 'paid',
      eventAt: new Date().toISOString(),
    },
  ],
};

export async function onRequestGet(
  context
) {
  try {
    const auth =
      await requireAdmin(
        context
      );

    if (auth.response) {
      return auth.response;
    }

    if (auth.preview) {
      return json(
        previewPayload
      );
    }

    const db =
      context.env
        .oneinto1_user_credits;

    await ensureAdminTables(
      db
    );

    const [
      purchaseStats,
      googleStats,
      monthStats,
      purchases,
      users,
      events,
    ] = await Promise.all([
      db
        .prepare(`
          SELECT
            COUNT(*) AS purchase_count,
            COALESCE(
              SUM(
                CASE
                  WHEN refunded = 0
                    THEN amount_cents
                  ELSE 0
                END
              ),
              0
            ) AS revenue_cents
          FROM lemon_purchases
        `)
        .first(),

      db
        .prepare(`
          SELECT
            COUNT(*) AS user_count
          FROM google_bonus_users
        `)
        .first(),

      db
        .prepare(`
          SELECT
            COUNT(*) AS month_count
          FROM lemon_purchases
          WHERE purchased_at >=
            datetime(
              'now',
              'start of month'
            )
        `)
        .first(),

      db
        .prepare(`
          SELECT
            order_id,
            order_number,
            customer_name,
            customer_email,
            product_name,
            variant_name,
            amount_cents,
            currency,
            status,
            refunded,
            purchased_at
          FROM lemon_purchases
          ORDER BY
            COALESCE(
              purchased_at,
              updated_at
            ) DESC
          LIMIT 100
        `)
        .all(),

      db
        .prepare(`
          SELECT
            email,
            bonus_used,
            marketing_opt_in,
            created_at,
            updated_at
          FROM google_bonus_users
          ORDER BY
            updated_at DESC
          LIMIT 100
        `)
        .all(),

      db
        .prepare(`
          SELECT
            event_name,
            customer_email,
            amount_cents,
            currency,
            status,
            event_at,
            received_at
          FROM lemon_webhook_events
          ORDER BY
            received_at DESC
          LIMIT 30
        `)
        .all(),
    ]);

    const purchaseRows =
      purchases.results || [];

    const firstCurrency =
      purchaseRows.find(
        (row) =>
          row.currency
      )?.currency ||
      'USD';

    return json({
      ok: true,
      previewMode: false,
      webhookConfigured:
        Boolean(
          context.env
            .LEMON_WEBHOOK_SECRET
        ),
      adminEmail:
        auth.user?.email ||
        null,
      stats: {
        totalPurchases:
          Number(
            purchaseStats
              ?.purchase_count ||
              0
          ),
        grossRevenueCents:
          Number(
            purchaseStats
              ?.revenue_cents ||
              0
          ),
        currency:
          firstCurrency,
        googleUsers:
          Number(
            googleStats
              ?.user_count ||
              0
          ),
        purchasesThisMonth:
          Number(
            monthStats
              ?.month_count ||
              0
          ),
      },
      purchases:
        purchaseRows.map(
          (row) => ({
            orderId:
              String(
                row.order_id
              ),
            orderNumber:
              row.order_number
                ? String(
                    row.order_number
                  )
                : '',
            customerName:
              row.customer_name
                ? String(
                    row.customer_name
                  )
                : '',
            customerEmail:
              row.customer_email
                ? String(
                    row.customer_email
                  )
                : '',
            productName:
              row.product_name
                ? String(
                    row.product_name
                  )
                : '',
            variantName:
              row.variant_name
                ? String(
                    row.variant_name
                  )
                : '',
            amountCents:
              Number(
                row.amount_cents ||
                  0
              ),
            currency:
              row.currency
                ? String(
                    row.currency
                  )
                : '',
            status:
              row.status
                ? String(
                    row.status
                  )
                : '',
            refunded:
              Number(
                row.refunded ||
                  0
              ) === 1,
            purchasedAt:
              row.purchased_at
                ? String(
                    row.purchased_at
                  )
                : '',
          })
        ),
      googleUsers:
        (users.results || [])
          .map((row) => ({
            email:
              String(
                row.email ||
                  ''
              ),
            bonusUsed:
              Number(
                row.bonus_used ||
                  0
              ),
            marketingOptIn:
              Number(
                row.marketing_opt_in ||
                  0
              ) === 1,
            createdAt:
              row.created_at
                ? String(
                    row.created_at
                  )
                : '',
            updatedAt:
              row.updated_at
                ? String(
                    row.updated_at
                  )
                : '',
          })),
      events:
        (events.results || [])
          .map((row) => ({
            eventName:
              String(
                row.event_name ||
                  ''
              ),
            customerEmail:
              row.customer_email
                ? String(
                    row.customer_email
                  )
                : '',
            amountCents:
              Number(
                row.amount_cents ||
                  0
              ),
            currency:
              row.currency
                ? String(
                    row.currency
                  )
                : '',
            status:
              row.status
                ? String(
                    row.status
                  )
                : '',
            eventAt:
              row.event_at
                ? String(
                    row.event_at
                  )
                : String(
                    row.received_at ||
                      ''
                  ),
          })),
    });
  } catch (error) {
    console.error(
      'Admin dashboard failed:',
      error
    );

    return json(
      {
        ok: false,
        error:
          'Unable to load admin dashboard.',
      },
      500
    );
  }
}

export function onRequest(
  context
) {
  if (
    context.request.method !==
    'GET'
  ) {
    return json(
      {
        ok: false,
        error:
          'Method not allowed.',
      },
      405
    );
  }

  return onRequestGet(
    context
  );
}
