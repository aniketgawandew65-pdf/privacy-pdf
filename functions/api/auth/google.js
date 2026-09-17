import { createRemoteJWKSet, jwtVerify } from 'jose';

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs')
);

const GOOGLE_CLIENT_ID =
  '760719022510-33gc9or94u0q7m07vv57h5g3nppkf7n3.apps.googleusercontent.com';

const SESSION_DAYS = 30;
const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function buildSessionCookie(requestUrl, sessionToken) {
  const url = new URL(requestUrl);
  const secure = url.protocol === 'https:' ? '; Secure' : '';

  return [
    `oneintoone_session=${sessionToken}`,
    'Path=/',
    `Max-Age=${SESSION_MAX_AGE}`,
    'HttpOnly',
    'SameSite=Lax',
    secure,
  ]
    .filter(Boolean)
    .join('; ');
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const credential =
      typeof body?.credential === 'string'
        ? body.credential.trim()
        : '';

    if (!credential) {
      return json(
        { ok: false, error: 'Missing Google credential.' },
        400
      );
    }

    const { payload } = await jwtVerify(
      credential,
      GOOGLE_JWKS,
      {
        audience: GOOGLE_CLIENT_ID,
        issuer: [
          'https://accounts.google.com',
          'accounts.google.com',
        ],
      }
    );

    const googleSub =
      typeof payload.sub === 'string'
        ? payload.sub
        : '';

    const email =
      typeof payload.email === 'string'
        ? payload.email.trim().toLowerCase()
        : '';

    const emailVerified =
      payload.email_verified === true;

    if (!googleSub || !email || !emailVerified) {
      return json(
        {
          ok: false,
          error: 'A verified Google account is required.',
        },
        403
      );
    }

    await context.env.oneinto1_user_credits
      .prepare(`
        INSERT INTO google_bonus_users (
          google_sub,
          email,
          email_verified,
          bonus_used,
          marketing_opt_in,
          created_at,
          updated_at
        )
        VALUES (?, ?, 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(google_sub) DO UPDATE SET
          email = excluded.email,
          email_verified = 1,
          updated_at = CURRENT_TIMESTAMP
      `)
      .bind(googleSub, email)
      .run();

    const user = await context.env.oneinto1_user_credits
      .prepare(`
        SELECT
          email,
          bonus_used,
          marketing_opt_in
        FROM google_bonus_users
        WHERE google_sub = ?
        LIMIT 1
      `)
      .bind(googleSub)
      .first();

    const bonusUsed = Math.min(
      2,
      Math.max(0, Number(user?.bonus_used || 0))
    );

    const sessionToken = randomToken();
    const sessionHash = await sha256(sessionToken);

    const expiresAt = new Date(
      Date.now() + SESSION_MAX_AGE * 1000
    ).toISOString();

    await context.env.oneinto1_user_credits
      .prepare(`
        INSERT INTO google_bonus_sessions (
          session_hash,
          google_sub,
          created_at,
          expires_at
        )
        VALUES (?, ?, CURRENT_TIMESTAMP, ?)
      `)
      .bind(sessionHash, googleSub, expiresAt)
      .run();

    const accountKey = await sha256(`google:${googleSub}`);

    return json(
      {
        ok: true,
        email: user?.email || email,
        accountKey,
        bonusUsed,
        bonusRemaining: Math.max(0, 2 - bonusUsed),
        marketingOptIn:
          Number(user?.marketing_opt_in || 0) === 1,
      },
      200,
      {
        'Set-Cookie': buildSessionCookie(
          context.request.url,
          sessionToken
        ),
      }
    );
  } catch (error) {
    console.error('Google authentication failed:', error);

    return json(
      {
        ok: false,
        error: 'Google authentication failed.',
      },
      401
    );
  }
}

export function onRequest(context) {
  if (context.request.method !== 'POST') {
    return json(
      { ok: false, error: 'Method not allowed.' },
      405
    );
  }

  return onRequestPost(context);
}
