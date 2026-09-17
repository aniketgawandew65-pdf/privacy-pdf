function getCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie') || '';

  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');

    if (key === name) {
      return rest.join('=');
    }
  }

  return null;
}

export async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function getSessionUser(context) {
  const token = getCookie(
    context.request,
    'oneintoone_session'
  );

  if (!token) {
    return null;
  }

  const sessionHash = await sha256(token);

  const row = await context.env.oneinto1_user_credits
    .prepare(`
      SELECT
        s.session_hash,
        s.google_sub,
        s.expires_at,
        u.email,
        u.bonus_used,
        u.marketing_opt_in
      FROM google_bonus_sessions s
      JOIN google_bonus_users u
        ON u.google_sub = s.google_sub
      WHERE s.session_hash = ?
      LIMIT 1
    `)
    .bind(sessionHash)
    .first();

  if (!row) {
    return null;
  }

  if (
    !row.expires_at ||
    new Date(row.expires_at).getTime() <= Date.now()
  ) {
    await context.env.oneinto1_user_credits
      .prepare(`
        DELETE FROM google_bonus_sessions
        WHERE session_hash = ?
      `)
      .bind(sessionHash)
      .run();

    return null;
  }

  return {
    sessionHash,
    googleSub: String(row.google_sub),
    email: String(row.email),
    bonusUsed: Math.min(
      2,
      Math.max(0, Number(row.bonus_used || 0))
    ),
    marketingOptIn:
      Number(row.marketing_opt_in || 0) === 1,
  };
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

export function clearSessionCookie(requestUrl) {
  const url = new URL(requestUrl);
  const secure = url.protocol === 'https:' ? '; Secure' : '';

  return [
    'oneintoone_session=',
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
    secure,
  ]
    .filter(Boolean)
    .join('; ');
}
