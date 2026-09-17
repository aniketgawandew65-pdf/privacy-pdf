import {
  clearSessionCookie,
  getSessionUser,
  json,
} from '../_session.js';

export async function onRequestPost(context) {
  try {
    const user = await getSessionUser(context);

    if (user) {
      await context.env.oneinto1_user_credits
        .prepare(`
          DELETE FROM google_bonus_sessions
          WHERE session_hash = ?
        `)
        .bind(user.sessionHash)
        .run();
    }

    return json(
      { ok: true },
      200,
      {
        'Set-Cookie': clearSessionCookie(
          context.request.url
        ),
      }
    );
  } catch (error) {
    console.error('Logout failed:', error);

    return json(
      { ok: false, error: 'Logout failed.' },
      500,
      {
        'Set-Cookie': clearSessionCookie(
          context.request.url
        ),
      }
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
