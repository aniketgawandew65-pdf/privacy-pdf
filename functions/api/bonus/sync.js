import {
  getSessionUser,
  json,
} from '../_session.js';

export async function onRequestPost(context) {
  try {
    const user = await getSessionUser(context);

    if (!user) {
      return json(
        {
          ok: false,
          error: 'Google sign-in required.',
        },
        401
      );
    }

    const body = await context.request.json();

    const localBonusUsed =
      Number(body?.bonusUsed);

    if (
      !Number.isInteger(localBonusUsed) ||
      localBonusUsed < 0 ||
      localBonusUsed > 2
    ) {
      return json(
        {
          ok: false,
          error: 'Invalid bonus usage.',
        },
        400
      );
    }

    const mergedUsed = Math.max(
      user.bonusUsed,
      localBonusUsed
    );

    await context.env.oneinto1_user_credits
      .prepare(`
        UPDATE google_bonus_users
        SET
          bonus_used = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE google_sub = ?
      `)
      .bind(
        mergedUsed,
        user.googleSub
      )
      .run();

    return json({
      ok: true,
      bonusUsed: mergedUsed,
      bonusRemaining: Math.max(
        0,
        2 - mergedUsed
      ),
    });
  } catch (error) {
    console.error('Bonus sync failed:', error);

    return json(
      {
        ok: false,
        error: 'Bonus sync failed.',
      },
      500
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
