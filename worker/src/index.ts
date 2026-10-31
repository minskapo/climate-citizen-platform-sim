import { todayReal } from '@shared/date';
import { buildCtx, verifyToken } from './auth';
import { countRequest, isBlocked } from './cap';
import { d1Db, fail, type Db, type Env, type Handler } from './db';
import { enter } from './routes/sim';
import { acceptTransfer, closeGroup, createGroup, createInvite, getGroupRoute, joinGroup, leaveGroup, listGroups, memberAction, patchGroup, transferGroup } from './routes/groups';
import { addComment, createPost, deletePost, getPost, hidePost, likePost, listPosts, patchPost, pinPost, popular, unhidePost, unpinPost } from './routes/posts';
import { getFile } from './routes/files';
import {
  addCampaignFile, cloneCampaign, createBundle, createCampaign, deleteCampaignFile, getCampaign, getHero, importBundle, listBundles, listCampaigns,
  patchCampaignFile, publishCampaign, putCampaignTools, putChecklist, putExplainer, putMissions, updateCampaign,
} from './routes/campaigns';
import { createReport } from './routes/reports';
import { createUser, getMe, listUsers, patchMe } from './routes/users';
import {
  cancelParticipation, checklistDone, getParticipation, participate, pauseParticipation, putReminder, quitParticipation,
} from './routes/participations';
import { listRecords, putRecord, todayCount } from './routes/records';
import { attend, attendManual, getAttendanceCode, unattend } from './routes/attendance';
import { claimMeasurements, createMeasurement, myMeasurements, putChoices } from './routes/measurements';
import { calculatorAggregate, signatureAggregate, toolAggregate } from './routes/aggregates';

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
  { method: 'POST', pattern: '/api/groups', handler: createGroup },
  { method: 'GET', pattern: '/api/groups', handler: listGroups },
  { method: 'GET', pattern: '/api/groups/:id', handler: getGroupRoute },
  { method: 'PATCH', pattern: '/api/groups/:id', handler: patchGroup },
  { method: 'POST', pattern: '/api/groups/:id/join', handler: joinGroup },
  { method: 'POST', pattern: '/api/groups/:id/leave', handler: leaveGroup },
  { method: 'POST', pattern: '/api/groups/:id/invites', handler: createInvite },
  { method: 'POST', pattern: '/api/groups/:id/members/:uid', handler: memberAction },
  { method: 'POST', pattern: '/api/groups/:id/transfer', handler: transferGroup },
  { method: 'POST', pattern: '/api/groups/:id/transfer/accept', handler: acceptTransfer },
  { method: 'POST', pattern: '/api/groups/:id/close', handler: closeGroup },
  { method: 'GET', pattern: '/api/boards/:type/:id/posts', handler: listPosts },
  { method: 'POST', pattern: '/api/boards/:type/:id/posts', handler: createPost },
  { method: 'GET', pattern: '/api/posts/:id', handler: getPost },
  { method: 'PATCH', pattern: '/api/posts/:id', handler: patchPost },
  { method: 'DELETE', pattern: '/api/posts/:id', handler: deletePost },
  { method: 'POST', pattern: '/api/posts/:id/pin', handler: pinPost },
  { method: 'POST', pattern: '/api/posts/:id/unpin', handler: unpinPost },
  { method: 'POST', pattern: '/api/posts/:id/hide', handler: hidePost },
  { method: 'POST', pattern: '/api/posts/:id/unhide', handler: unhidePost },
  { method: 'POST', pattern: '/api/posts/:id/like', handler: likePost },
  { method: 'POST', pattern: '/api/posts/:id/comments', handler: addComment },
  { method: 'GET', pattern: '/api/popular', handler: popular },
  { method: 'GET', pattern: '/api/files/:id', handler: getFile },
  { method: 'POST', pattern: '/api/reports', handler: createReport },
  { method: 'GET', pattern: '/api/campaigns', handler: listCampaigns },
  { method: 'POST', pattern: '/api/campaigns', handler: createCampaign },
  { method: 'GET', pattern: '/api/campaigns/hero', handler: getHero }, // before :id
  { method: 'GET', pattern: '/api/campaigns/:id', handler: getCampaign },
  { method: 'PUT', pattern: '/api/campaigns/:id', handler: updateCampaign },
  { method: 'POST', pattern: '/api/campaigns/:id/publish', handler: publishCampaign },
  { method: 'POST', pattern: '/api/campaigns/:id/clone', handler: cloneCampaign },
  { method: 'PUT', pattern: '/api/campaigns/:id/missions', handler: putMissions },
  { method: 'POST', pattern: '/api/campaigns/:id/missions/from-bundle/:bundleId', handler: importBundle },
  { method: 'PUT', pattern: '/api/campaigns/:id/checklist', handler: putChecklist },
  { method: 'POST', pattern: '/api/campaigns/:id/files', handler: addCampaignFile },
  { method: 'PATCH', pattern: '/api/campaigns/:id/files/:fileId', handler: patchCampaignFile },
  { method: 'DELETE', pattern: '/api/campaigns/:id/files/:fileId', handler: deleteCampaignFile },
  { method: 'PUT', pattern: '/api/campaigns/:id/tools', handler: putCampaignTools },
  { method: 'PUT', pattern: '/api/campaigns/:id/explainer', handler: putExplainer },
  { method: 'GET', pattern: '/api/mission-bundles', handler: listBundles },
  { method: 'POST', pattern: '/api/mission-bundles', handler: createBundle },
  { method: 'POST', pattern: '/api/campaigns/:id/participate', handler: participate },
  { method: 'POST', pattern: '/api/campaigns/:id/checklist/:itemId/done', handler: checklistDone },
  { method: 'GET', pattern: '/api/campaigns/:id/today-count', handler: todayCount },
  { method: 'GET', pattern: '/api/campaigns/:id/attendance-code', handler: getAttendanceCode },
  { method: 'POST', pattern: '/api/campaigns/:id/attend', handler: attend },
  { method: 'GET', pattern: '/api/participations/:id', handler: getParticipation },
  { method: 'POST', pattern: '/api/participations/:id/cancel', handler: cancelParticipation },
  { method: 'POST', pattern: '/api/participations/:id/pause', handler: pauseParticipation },
  { method: 'POST', pattern: '/api/participations/:id/quit', handler: quitParticipation },
  { method: 'PUT', pattern: '/api/participations/:id/reminder', handler: putReminder },
  { method: 'GET', pattern: '/api/participations/:id/records', handler: listRecords },
  { method: 'PUT', pattern: '/api/participations/:id/records/:slotDate', handler: putRecord },
  { method: 'POST', pattern: '/api/participations/:id/attend-manual', handler: attendManual },
  { method: 'POST', pattern: '/api/participations/:id/unattend', handler: unattend },
  { method: 'POST', pattern: '/api/measurements', handler: createMeasurement },
  { method: 'POST', pattern: '/api/measurements/claim', handler: claimMeasurements }, // before :id
  { method: 'POST', pattern: '/api/measurements/:id/choices', handler: putChoices },
  { method: 'GET', pattern: '/api/me/measurements', handler: myMeasurements },
  { method: 'GET', pattern: '/api/aggregates/calculator', handler: calculatorAggregate },
  { method: 'GET', pattern: '/api/aggregates/signature/:id', handler: signatureAggregate },
  { method: 'GET', pattern: '/api/aggregates/tool/:toolId/:key', handler: toolAggregate },
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

  const ctx = buildCtx(req, db, env.TOKEN_SECRET);
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
