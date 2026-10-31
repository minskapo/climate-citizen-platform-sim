import { issueToken, safeEqual } from '../auth';
import { enterFailCount, enterFailKey, MAX_ENTER_FAILS, recordEnterFail } from '../cap';
import { fail, json, type Db, type Env } from '../db';

export async function enter(req: Request, env: Env, db: Db): Promise<Response> {
  const key = enterFailKey(req.headers.get('CF-Connecting-IP') ?? 'unknown');
  if ((await enterFailCount(db, key)) >= MAX_ENTER_FAILS) {
    return fail(429, 'TOO_MANY_ATTEMPTS', '시도 횟수가 너무 많아요. 잠시 후 다시 해 주세요');
  }
  let body: { passcode?: unknown };
  try {
    body = (await req.json()) as { passcode?: unknown };
  } catch {
    return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  }
  const passcode = typeof body.passcode === 'string' ? body.passcode : '';
  if (!env.SIM_PASSCODE || !safeEqual(passcode, env.SIM_PASSCODE)) {
    await recordEnterFail(db, key);
    return fail(401, 'BAD_PASSCODE', '입장 코드가 맞지 않아요');
  }
  return json({ token: await issueToken(env.TOKEN_SECRET, Date.now()) });
}
