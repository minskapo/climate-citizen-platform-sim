import { todayReal } from '@shared/date';
import { buildCtx, verifyToken } from './auth';
import { countRequest, isBlocked } from './cap';
import { d1Db, fail, type Db, type Env, type Handler } from './db';
import { enter } from './routes/sim';
import { acceptTransfer, closeGroup, createGroup, createInvite, getGroupRoute, joinGroup, leaveGroup, listGroups, listMembers, memberAction, patchGroup, transferGroup } from './routes/groups';
import { addComment, createPost, deletePost, getPost, hidePost, likePost, listPosts, patchPost, pinPost, popular, unhidePost, unpinPost } from './routes/posts';
import { groupParticipants } from './routes/admin';
import { getFile } from './routes/files';
import {
  addCampaignFile, cloneCampaign, createBundle, createCampaign, deleteCampaignFile, getCampaign, getHero, importBundle, listBundles, listCampaigns,
  patchCampaignFile, publishCampaign, putCampaignTools, putChecklist, putExplainer, putMissions, subscribeCampaign, unsubscribeCampaign, updateCampaign,
} from './routes/campaigns';
import { createReport } from './routes/reports';
import { listNotifications, readNotifications, syncNotifications } from './routes/notifications';
import { createCollab, draftFromCollab, listCollab, replyCollab } from './routes/collab';
import { getDelivery, postDelivery, postDeliveryAnswer } from './routes/deliveries';
import { addVersion, createTool, getPublished, listTools, myToolRecords, publishToolVersion, rollbackTool, saveToolRecord } from './routes/tools';
import { adminCloseGroup, adminExport, adminGroups, adminHome, adminParticipants, adminReports, adminUsers, resolveReport, restrictUser, sendNotice } from './routes/admin';
import { simExport, simReset } from './routes/simData';
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
  { method: 'GET', pattern: '/api/groups/:id/members', handler: listMembers },
  { method: 'GET', pattern: '/api/groups/:id/campaigns/:cid/participants', handler: groupParticipants },
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
  { method: 'POST', pattern: '/api/campaigns/:id/subscribe', handler: subscribeCampaign },
  { method: 'DELETE', pattern: '/api/campaigns/:id/subscribe', handler: unsubscribeCampaign },
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
  { method: 'GET', pattern: '/api/notifications', handler: listNotifications },
  { method: 'POST', pattern: '/api/notifications/read', handler: readNotifications },
  { method: 'POST', pattern: '/api/notifications/sync', handler: syncNotifications },
  { method: 'POST', pattern: '/api/campaigns/:id/notices', handler: sendNotice },
  { method: 'GET', pattern: '/api/campaigns/:id/delivery', handler: getDelivery },
  { method: 'POST', pattern: '/api/campaigns/:id/delivery', handler: postDelivery },
  { method: 'POST', pattern: '/api/campaigns/:id/delivery/answers', handler: postDeliveryAnswer },
  { method: 'POST', pattern: '/api/collab', handler: createCollab },
  { method: 'GET', pattern: '/api/admin/collab', handler: listCollab },
  { method: 'POST', pattern: '/api/admin/collab/:id/reply', handler: replyCollab },
  { method: 'POST', pattern: '/api/admin/collab/:id/draft', handler: draftFromCollab },
  { method: 'POST', pattern: '/api/tools', handler: createTool },
  { method: 'GET', pattern: '/api/tools', handler: listTools },
  { method: 'POST', pattern: '/api/tools/:id/versions', handler: addVersion },
  { method: 'POST', pattern: '/api/tools/:id/versions/:v/publish', handler: publishToolVersion },
  { method: 'POST', pattern: '/api/tools/:id/rollback', handler: rollbackTool },
  { method: 'GET', pattern: '/api/tools/:id/published', handler: getPublished },
  { method: 'POST', pattern: '/api/tools/:id/records', handler: saveToolRecord },
  { method: 'GET', pattern: '/api/tools/:id/records/mine', handler: myToolRecords },
  { method: 'GET', pattern: '/api/admin/home', handler: adminHome },
  { method: 'GET', pattern: '/api/admin/campaigns/:id/participants', handler: adminParticipants },
  { method: 'GET', pattern: '/api/admin/campaigns/:id/export', handler: adminExport },
  { method: 'GET', pattern: '/api/admin/reports', handler: adminReports },
  { method: 'POST', pattern: '/api/admin/reports/:id', handler: resolveReport },
  { method: 'GET', pattern: '/api/admin/groups', handler: adminGroups },
  { method: 'POST', pattern: '/api/admin/groups/:id/close', handler: adminCloseGroup },
  { method: 'GET', pattern: '/api/admin/users', handler: adminUsers },
  { method: 'POST', pattern: '/api/admin/users/:id/restrict', handler: restrictUser },
  { method: 'GET', pattern: '/api/sim/export', handler: simExport },
  { method: 'POST', pattern: '/api/sim/reset', handler: simReset },
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
  'content-type, x-sim-token, x-user-id, x-role, x-sim-date, x-sim-time, x-staff-group, x-preview';

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

  ctx.simPasscode = env.SIM_PASSCODE;
  // 이용 제한: restricted members can read but not write.
  if (ctx.userId && ctx.role !== 'admin' && req.method !== 'GET' && req.method !== 'HEAD' && url.pathname !== '/api/sim/reset') {
    const u = await db.first<{ restricted: number }>('SELECT restricted FROM users WHERE id = ?', ctx.userId);
    if (u?.restricted) return fail(403, 'RESTRICTED', '이용이 제한된 계정이에요');
  }

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
