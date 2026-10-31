import { todayReal } from '@shared/date';
import { buildCtx, verifyToken } from './auth';
import { countRequest, isBlocked } from './cap';
import { d1Db, fail, type Db, type Env, type Handler } from './db';
import { enter } from './routes/sim';
import { createUser, getMe, listUsers, patchMe } from './routes/users';

const ALLOWED_ORIGINS = ['https://minskapo.github.io', 'http://localhost:5173'];

interface Route {
  method: string;
  pattern: string;
  handler: Handler;
}

/** Later tasks append their routes here. */
export const routes: Route[] = [
  { method: 'POST', pattern: '/api/users', handler: createUser },
  { method: 'GET', pattern: '/api/users', handler: listUsers },
  { method: 'GET', pattern: '/api/me', handler: getMe },
  { method: 'PATCH', pattern: '/api/me', handler: patchMe },
];

function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/');
  const b = path.split('/');
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

function withCors(res: Response, origin: string | null): Response {
  const out = new Response(res.body, res);
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    out.headers.set('access-control-allow-origin', origin);
    out.headers.set('vary', 'Origin');
  }
  return out;
}

const CORS_HEADERS =
  'content-type, x-sim-token, x-user-id, x-role, x-sim-date, x-sim-time, x-staff-group';

export async function handle(req: Request, env: Env, db: Db): Promise<Response> {
  const origin = req.headers.get('origin');
  try {
    return withCors(await route(req, env, db), origin);
  } catch (e) {
    console.error(e);
    return withCors(fail(500, 'INTERNAL', '서버에 문제가 생겼어요'), origin);
  }
}

async function route(req: Request, env: Env, db: Db): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
        'access-control-allow-headers': CORS_HEADERS,
        'access-control-max-age': '86400',
      },
    });
  }

  const url = new URL(req.url);
  if (!url.pathname.startsWith('/api/')) return fail(404, 'NOT_FOUND', '찾을 수 없어요');

  if (req.method === 'POST' && url.pathname === '/api/enter') return enter(req, env, db);

  const token = req.headers.get('X-Sim-Token');
  if (!token) return fail(401, 'NO_TOKEN', '입장 코드를 먼저 입력해 주세요');
  if (!(await verifyToken(env.TOKEN_SECRET, token, Date.now()))) {
    return fail(401, 'BAD_TOKEN', '입장 시간이 지났어요. 다시 입장해 주세요');
  }

  // Only token-verified requests count toward the daily cap.
  const count = await countRequest(db, todayReal());
  if (isBlocked(count, req.method)) {
    return fail(503, 'DAILY_CAP', '오늘 쓸 수 있는 요청 수를 모두 썼어요. 내일 다시 시도해 주세요');
  }

  const ctx = buildCtx(req, db);
  if (ctx instanceof Response) return ctx;

  let pathMatched = false;
  for (const r of routes) {
    const params = match(r.pattern, url.pathname);
    if (!params) continue;
    pathMatched = true;
    if (r.method === req.method) return r.handler(req, ctx, params);
  }
  return pathMatched ? fail(405, 'METHOD_NOT_ALLOWED', '지원하지 않는 요청이에요') : fail(404, 'NOT_FOUND', '찾을 수 없어요');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await handle(req, env, d1Db(env.DB));
    } catch (e) {
      console.error(e);
      return withCors(fail(500, 'INTERNAL', '서버에 문제가 생겼어요'), req.headers.get('origin'));
    }
  },
};
