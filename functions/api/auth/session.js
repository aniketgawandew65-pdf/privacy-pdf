import {
  getSessionUser,
  json,
  sha256,
} from '../_session.js';

export async function onRequestGet(context) {
  try {
    const user = await getSessionUser(context);

    if (!user) {
      return json({
        ok: true,
        signedIn: false,
      });
    }

    const accountKey =
      await sha256(`google:${user.googleSub}`);

    return json({
      ok: true,
      signedIn: true,
      email: user.email,
      accountKey,
      bonusUsed: user.bonusUsed,
      bonusRemaining: Math.max(
        0,
        2 - user.bonusUsed
      ),
      marketingOptIn: user.marketingOptIn,
    });
  } catch (error) {
    console.error('Session lookup failed:', error);

    return json(
      {
        ok: false,
        error: 'Could not restore session.',
      },
      500
    );
  }
}

export function onRequest(context) {
  if (context.request.method !== 'GET') {
    return json(
      { ok: false, error: 'Method not allowed.' },
      405
    );
  }

  return onRequestGet(context);
}
