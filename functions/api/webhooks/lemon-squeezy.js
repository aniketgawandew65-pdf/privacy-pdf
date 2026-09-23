import {
  ensureAdminTables,
} from '../admin/_admin.js';

import {
  json,
} from '../_session.js';

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((value) =>
      value
        .toString(16)
        .padStart(2, '0')
    )
    .join('');
}

async function hmacHex(
  secret,
  body
) {
  const key =
    await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(
        secret
      ),
      {
        name: 'HMAC',
        hash: 'SHA-256',
      },
      false,
      ['sign']
    );

  const signature =
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(
        body
      )
    );

  return bytesToHex(
    new Uint8Array(
      signature
    )
  );
}

function safeEqual(
  left,
  right
) {
  if (
    !left ||
    !right ||
    left.length !==
      right.length
  ) {
    return false;
  }

  let diff = 0;

  for (
    let index = 0;
    index < left.length;
    index++
  ) {
    diff |=
      left.charCodeAt(
        index
      ) ^
      right.charCodeAt(
        index
      );
  }

  return diff === 0;
}

function stringValue(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value);
}

function numberValue(
  value
) {
  const numeric =
    Number(value);

  return Number.isFinite(
    numeric
  )
    ? Math.round(
        numeric
      )
    : 0;
}

export async function onRequestPost(
  context
) {
  try {
    const secret =
      context.env
        .LEMON_WEBHOOK_SECRET;

    if (!secret) {
      return json(
        {
          ok: false,
          error:
            'Webhook is not configured.',
        },
        503
      );
    }

    const rawBody =
      await context.request.text();

    const receivedSignature =
      (
        context.request.headers.get(
          'X-Signature'
        ) ||
        context.request.headers.get(
          'x-signature'
        ) ||
        ''
      )
        .trim()
        .toLowerCase();

    const expectedSignature =
      await hmacHex(
        secret,
        rawBody
      );

    if (
      !safeEqual(
        receivedSignature,
        expectedSignature
      )
    ) {
      return json(
        {
          ok: false,
          error:
            'Invalid webhook signature.',
        },
        401
      );
    }

    const payload =
      JSON.parse(
        rawBody
      );

    const eventName =
      stringValue(
        payload?.meta
          ?.event_name
      );

    const data =
      payload?.data || {};

    const attributes =
      data?.attributes ||
      {};

    const resourceId =
      stringValue(
        data?.id
      );

    const resourceType =
      stringValue(
        data?.type
      );

    const customerEmail =
      stringValue(
        attributes.user_email ||
          attributes.customer_email
      )
        .trim()
        .toLowerCase();

    const amountCents =
      numberValue(
        attributes.total ||
          attributes.total_usd ||
          0
      );

    const currency =
      stringValue(
        attributes.currency
      ).toUpperCase();

    const status =
      stringValue(
        attributes.status
      );

    const eventAt =
      stringValue(
        attributes.updated_at ||
          attributes.created_at
      ) ||
      new Date().toISOString();

    const eventKey =
      [
        eventName ||
          'unknown',
        resourceType ||
          'resource',
        resourceId ||
          'unknown',
        eventAt,
      ].join(':');

    const db =
      context.env
        .oneinto1_user_credits;

    await ensureAdminTables(
      db
    );

    await db
      .prepare(`
        INSERT OR IGNORE INTO lemon_webhook_events (
          event_key,
          event_name,
          resource_type,
          resource_id,
          customer_email,
          amount_cents,
          currency,
          status,
          event_at,
          received_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `)
      .bind(
        eventKey,
        eventName ||
          'unknown',
        resourceType,
        resourceId,
        customerEmail,
        amountCents,
        currency,
        status,
        eventAt
      )
      .run();

    if (
      resourceType ===
        'orders' &&
      resourceId
    ) {
      const firstOrderItem =
        attributes.first_order_item ||
        {};

      const refunded =
        attributes.refunded ===
          true ||
        eventName ===
          'order_refunded'
          ? 1
          : 0;

      await db
        .prepare(`
          INSERT INTO lemon_purchases (
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
            purchased_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(order_id) DO UPDATE SET
            order_number = excluded.order_number,
            customer_name = excluded.customer_name,
            customer_email = excluded.customer_email,
            product_name = excluded.product_name,
            variant_name = excluded.variant_name,
            amount_cents = excluded.amount_cents,
            currency = excluded.currency,
            status = excluded.status,
            refunded = excluded.refunded,
            purchased_at = COALESCE(
              lemon_purchases.purchased_at,
              excluded.purchased_at
            ),
            updated_at = CURRENT_TIMESTAMP
        `)
        .bind(
          resourceId,
          stringValue(
            attributes.order_number ||
              attributes.identifier
          ),
          stringValue(
            attributes.user_name ||
              attributes.customer_name
          ),
          customerEmail,
          stringValue(
            firstOrderItem
              .product_name
          ),
          stringValue(
            firstOrderItem
              .variant_name
          ),
          amountCents,
          currency,
          status ||
            eventName,
          refunded,
          stringValue(
            attributes.created_at
          ) ||
            eventAt
        )
        .run();
    }

    return json({
      ok: true,
    });
  } catch (error) {
    console.error(
      'Lemon Squeezy webhook failed:',
      error
    );

    return json(
      {
        ok: false,
        error:
          'Webhook processing failed.',
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
    'POST'
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

  return onRequestPost(
    context
  );
}
