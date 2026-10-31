import { issueToken, safeEqual } from '../auth';
import { fail, json, type Env } from '../db';

export async function enter(req: Request, env: Env): Promise<Response> {
  let body: { passcode?: unknown };
  try {
    body = (await req.json()) as { passcode?: unknown };
  } catch {
    return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  }
  const passcode = typeof body.passcode === 'string' ? body.passcode : '';
  if (!env.SIM_PASSCODE || !safeEqual(passcode, env.SIM_PASSCODE)) {
    return fail(401, 'BAD_PASSCODE', '입장 코드가 맞지 않아요');
  }
  return json({ token: await issueToken(env.TOKEN_SECRET, Date.now()) });
}
