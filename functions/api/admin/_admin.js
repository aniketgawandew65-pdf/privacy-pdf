import {
  getSessionUser,
  json,
} from '../_session.js';

export function isPreviewDeployment(request) {
  const hostname =
    new URL(request.url).hostname;

  return (
    hostname.endsWith(
      '.privacy-pdf.pages.dev'
    ) &&
    hostname !==
      'privacy-pdf.pages.dev'
  );
}

function adminEmailSet(env) {
  const raw = [
    env.ADMIN_EMAILS,
    env.ADMIN_EMAIL,
  ]
    .filter(Boolean)
    .join(',');

  return new Set(
    raw
      .split(',')
      .map((value) =>
        value
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  );
}

export async function requireAdmin(
  context
) {
  if (
    isPreviewDeployment(
      context.request
    )
  ) {
    return {
      preview: true,
      user: null,
    };
  }

  const user =
    await getSessionUser(
      context
    );

  if (!user) {
    return {
      response: json(
        {
          ok: false,
          error:
            'Sign in with your authorized Google account.',
        },
        401
      ),
    };
  }

  const allowed =
    adminEmailSet(
      context.env
    );

  if (
    allowed.size === 0
  ) {
    return {
      response: json(
        {
          ok: false,
          error:
            'Admin access is not configured yet.',
        },
        503
      ),
    };
  }

  if (
    !allowed.has(
      user.email
        .trim()
        .toLowerCase()
    )
  ) {
    return {
      response: json(
        {
          ok: false,
          error:
            'This Google account is not authorized for the admin dashboard.',
        },
        403
      ),
    };
  }

  return {
    preview: false,
    user,
  };
}

export async function ensureAdminTables(
  db
) {
  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS lemon_purchases (
        order_id TEXT PRIMARY KEY,
        order_number TEXT,
        customer_name TEXT,
        customer_email TEXT,
        product_name TEXT,
        variant_name TEXT,
        amount_cents INTEGER NOT NULL DEFAULT 0,
        currency TEXT,
        status TEXT,
        refunded INTEGER NOT NULL DEFAULT 0,
        purchased_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    .run();

  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS lemon_webhook_events (
        event_key TEXT PRIMARY KEY,
        event_name TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        customer_email TEXT,
        amount_cents INTEGER NOT NULL DEFAULT 0,
        currency TEXT,
        status TEXT,
        event_at TEXT,
        received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    .run();

  await db
    .prepare(`
      CREATE INDEX IF NOT EXISTS idx_lemon_purchases_date
      ON lemon_purchases(purchased_at DESC)
    `)
    .run();

  await db
    .prepare(`
      CREATE INDEX IF NOT EXISTS idx_lemon_events_date
      ON lemon_webhook_events(received_at DESC)
    `)
    .run();
}
