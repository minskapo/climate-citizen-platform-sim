// 예시 데이터 채우기: 시안(Figma, docs/figma/)의 예시 화면 내용을 배포된 Worker의 공개 API로만 넣어요.
// 기준일은 2027-01-19(SIM_BASE_DATE)이고, 모든 글 · 신청 · 기록은 그 전 날짜(X-Sim-Date)로 들어가요.
//
//   SIM_PASSCODE=<입장 암호> node scripts/seed.mjs              # 캠페인 · 모임이 하나도 없을 때만
//   SIM_PASSCODE=<입장 암호> SEED_FORCE=1 node scripts/seed.mjs # 체험 데이터를 모두 지우고 다시 채우기
//   SEED_API_BASE=http://localhost:8787 …                        # 다른 Worker에 넣기
//
// 초당 10건 이하로 보내고, 전체 요청은 1,500건 안팎이에요.

const API = (process.env.SEED_API_BASE || 'https://climate-sim.minskapo.workers.dev').replace(/\/$/, '');
const PASSCODE = process.env.SIM_PASSCODE;
const FORCE = process.env.SEED_FORCE === '1';
const MIN_GAP_MS = 105; // ≤ 10 requests / s

if (!PASSCODE) {
  console.error('SIM_PASSCODE 환경 변수에 입장 암호를 넣어 주세요.');
  process.exit(1);
}

// ---- HTTP -------------------------------------------------------------------

let token = null;
let sent = 0;
let lastAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * as: null (비회원) · user object {id, admin?} · 'admin' (관리자, 활동명 「기후시민팀」).
 * ok: extra status codes to accept (e.g. 409 when already a member).
 */
async function call(method, path, { as = null, date = '2027-01-19', time = '10:00', body, ok = [] } = {}) {
  const wait = lastAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastAt = Date.now();
  sent++;
  const headers = { 'content-type': 'application/json', 'X-Sim-Date': date, 'X-Sim-Time': time };
  if (token) headers['X-Sim-Token'] = token;
  const who = as === 'admin' ? users.get('기후시민팀') : as;
  if (as === 'admin') headers['X-Role'] = 'admin';
  else if (who) headers['X-Role'] = 'member';
  if (who?.id) headers['X-User-Id'] = who.id;
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      if (res.status >= 500 && attempt < 2) { await sleep(1000); continue; }
      break;
    } catch (e) {
      if (attempt >= 2) throw e;
      await sleep(1000);
    }
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (res.status >= 400 && !ok.includes(res.status)) {
    throw new Error(`${method} ${path} (${date}) → ${res.status} ${data?.error?.code ?? ''} ${data?.error?.message ?? text}`);
  }
  return data;
}

// ---- deterministic randomness ------------------------------------------------

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
const R = rng(20270119);
const pick = (a, r = R) => a[Math.floor(r() * a.length)];
const shuffle = (a, r = R) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const pad = (n) => String(n).padStart(2, '0');
const addDays = (d, n) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const dateBetween = (a, b, r = R) => { const days = Math.round((Date.parse(b) - Date.parse(a)) / 86400000); return addDays(a, Math.floor(r() * (days + 1))); };
const timeAt = (r = R) => `${pad(8 + Math.floor(r() * 14))}:${pad(Math.floor(r() * 60))}`;
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

/** 1.5도 계산기 응답 (서버가 결과를 다시 계산해요). 평균 10~11톤 안팎. */
function answersFor(seed) {
  const r = rng(seed * 7919 + 13);
  const p = (a) => pick(a, r);
  return {
    eatOut: p([1, 2, 3, 4, 6]), diet: p([0, 1, 1, 2]), coffee: p([0, 0, 1]), waste: p([0, 0, 1]),
    clothes: p([5, 10, 15, 25, 40]), mend: p([0, 1, 3]),
    appliances: { fridge: 1, aircon: p([0, 1, 2]), washer: 1, dishdryer: p([0, 1]), dryer: p([0, 0, 1]) },
    devices: { tablet: p([0, 1]), watch: p([0, 1]) },
    subway: p([0, 2, 4, 6]), bus: p([1, 3, 5]), bike: p([0, 0, 1, 2]), ev: 0, car: p([0, 3, 6, 9, 12]),
    train: p([2, 6, 12]), flight: p([0, 10, 20, 30, 40]), members: p([1, 2, 3, 4]), areaTotal: p([15, 24, 32]),
    elec: p([1, 2, 2, 3]), heatType: p([0, 0, 1]), heatCost: p([0, 1, 1, 2]), solar: 0, insulation: p([0, 1]),
    ai: p([0, 1, 2]), leisureWays: [p(['tv', 'mobile', 'book'])], ski: p([0, 0, 2]), golf: 0, stay: p([2, 4, 8]),
  };
}
/** 햇빛부자의 응답: car/flight만 바꿔 11.8톤(2026. 2.) → 10.4톤(2026. 3.) → 11.2톤(2027. 1.). */
const sunny = (car, flight) => ({
  ...answersFor(1), eatOut: 2, diet: 1, coffee: 0, waste: 0, clothes: 12, mend: 2, subway: 0, bus: 3, bike: 1, car, train: 6, flight,
  members: 2, areaTotal: 28, elec: 2, heatType: 0, heatCost: 1, solar: 0, insulation: 0, ai: 1, leisureWays: ['tv'], ski: 0, golf: 0, stay: 4,
});

// ---- people -----------------------------------------------------------------

/** name → { id, name, sido, sigungu } */
const users = new Map();
const U = (name) => {
  const u = users.get(name);
  if (!u) throw new Error(`no user ${name}`);
  return u;
};
const regionOf = (u) => `${u.sido} ${u.sigungu}`.trim();

// 시안에 나오는 사람들 (마지막에 만들어서 활동명 고르기 목록 맨 위에 보여요)
const NAMED = [
  ['기후정치바람', '서울', '', '2026-10-15'],
  ['두바퀴', '서울', '성동구', '2026-03-27'],
  ['수원지구인', '경기', '수원시', '2026-07-20'],
  ['햇살가득', '경기', '고양시', '2025-11-10'],
  ['성산동주민', '서울', '마포구', '2026-06-01'],
  ['마포살이', '서울', '마포구', '2026-05-12'],
  ['밤하늘', '대전', '유성구', '2025-09-01'],
  ['도시농부', '부산', '수영구', '2025-09-20'],
  ['원주자전거', '강원', '원주시', '2026-04-10'],
  ['느린살림', '강원', '횡성군', '2026-09-03'],
  ['바람개비', '서울', '마포구', '2025-11-10'],
  ['초록걸음', '강원', '원주시', '2026-02-15'],
  ['기후시민팀', '서울', '은평구', '2025-09-01'],
  ['햇빛부자', '강원', '원주시', '2026-01-20'],
];
const GENERIC_REGIONS = [
  ['서울', '마포구'], ['서울', '마포구'], ['서울', '마포구'], ['서울', '은평구'], ['서울', '은평구'], ['서울', '은평구'],
  ['서울', '관악구'], ['서울', '관악구'], ['경기', '수원시'], ['경기', '수원시'], ['경기', '수원시'], ['강원', '원주시'],
  ['강원', '원주시'], ['강원', '원주시'], ['서울', '노원구'], ['서울', '성북구'], ['서울', '강서구'], ['경기', '고양시'],
  ['경기', '성남시'], ['인천', '연수구'], ['부산', '해운대구'], ['대구', '수성구'], ['대전', '서구'], ['광주', '북구'],
  ['충북', '청주시'], ['전북', '전주시'], ['경남', '창원시'], ['제주', '제주시'], ['강원', '춘천시'], ['세종', ''],
];
const GENERIC = GENERIC_REGIONS.map(([sido, sigungu], i) => [`시민${pad(i + 1)}`, sido, sigungu]);
const GEN = GENERIC.map(([n]) => n);

// 서명 지역이 시안처럼 보이도록 더하는 주민들 (마포 · 은평 · 원주 · 수원 · 관악 + 그 밖의 지역)
const POOL_PLAN = [
  ['마포', '서울', '마포구', 19], ['은평', '서울', '은평구', 17], ['원주', '강원', '원주시', 9], ['수원', '경기', '수원시', 8],
  ['관악', '서울', '관악구', 8], ['노원', '서울', '노원구', 2], ['성북', '서울', '성북구', 2], ['고양', '경기', '고양시', 2],
  ['용인', '경기', '용인시', 2], ['파주', '경기', '파주시', 1], ['인천', '인천', '부평구', 2], ['해운대', '부산', '해운대구', 1],
  ['천안', '충남', '천안시', 2], ['포항', '경북', '포항시', 1], ['강동', '서울', '강동구', 2], ['강릉', '강원', '강릉시', 1],
];
const POOL = POOL_PLAN.flatMap(([label, sido, sigungu, n]) => Array.from({ length: n }, (_, i) => [`${label}주민${pad(i + 1)}`, sido, sigungu]));
const POOL_NAMES = POOL.map(([n]) => n);
const byRegion = (label) => POOL_NAMES.filter((n) => n.startsWith(label + '주민'));

// ---- groups -----------------------------------------------------------------

const groups = new Map(); // key → { id, name, owner, policy }
const members = new Map(); // key → Map(userName → role)

async function createGroup(key, ownerName, g, date) {
  const owner = U(ownerName);
  const res = await call('POST', '/api/groups', { as: owner, date, body: g });
  groups.set(key, { id: res.id, name: g.name, owner: ownerName, policy: g.joinPolicy });
  members.set(key, new Map([[ownerName, 'owner']]));
}

async function join(key, name, date) {
  const g = groups.get(key);
  const m = members.get(key);
  if (m.has(name)) return;
  if (g.policy === 'private') throw new Error(`private group ${key} needs a campaign or invite`);
  const r = await call('POST', `/api/groups/${g.id}/join`, { as: U(name), date, time: timeAt(), ok: [409] });
  if (r?.role === 'pending') {
    await call('POST', `/api/groups/${g.id}/members/${U(name).id}`, { as: U(g.owner), date, body: { action: 'approve' } });
  }
  m.set(name, 'member');
}

async function pending(key, name, date) {
  const g = groups.get(key);
  await call('POST', `/api/groups/${g.id}/join`, { as: U(name), date });
  members.get(key).set(name, 'pending');
}

async function makeStaff(key, name, date) {
  const g = groups.get(key);
  await join(key, name, date);
  await call('POST', `/api/groups/${g.id}/members/${U(name).id}`, { as: U(g.owner), date, body: { action: 'staff' } });
  members.get(key).set(name, 'staff');
}

/** Campaign participation auto-joins the host group (server side). */
const markJoined = (key, name) => { const m = members.get(key); if (key && m && !m.has(name)) m.set(name, 'member'); };

// ---- posts ------------------------------------------------------------------

let postCount = 0, commentCount = 0, likeCount = 0;
const COMMENT_POOL = [
  '정리해 주셔서 고마워요. 저장해 두고 다시 읽을게요.', '저도 궁금했던 내용이에요!', '다음 모임 때 이 이야기 같이 나눠요.',
  '좋은 정보 감사합니다 🙂', '우리 동네도 비슷한지 찾아봐야겠어요.', '링크 공유해 주셔서 잘 봤어요.',
  '저도 해 봤는데 생각보다 어렵지 않았어요.', '이번 주에 꼭 해 볼게요.', '사진까지 올려 주시니 이해가 쉬워요.',
  '혹시 출처도 알 수 있을까요?', '응원합니다! 같이 해요.', '지난번 이야기와 이어지네요. 반가워요.',
];

/**
 * p: { key|campaign, author, category, title, body, date, time?, comments?: number | [ [name, text] ], likes?: number, pin?, hide? }
 * Commenters are picked from the board's members; likers from everyone.
 */
async function post(p) {
  const board = p.campaign ? { type: 'campaign', id: p.campaign } : { type: 'group', id: groups.get(p.key).id };
  const author = U(p.author);
  const res = await call('POST', `/api/boards/${board.type}/${board.id}/posts`, {
    as: author, date: p.date, time: p.time ?? timeAt(), body: { category: p.category, title: p.title, body: p.body },
  });
  postCount++;
  const staff = p.staffBy ? U(p.staffBy) : p.key ? U(groups.get(p.key).owner) : null;
  if (p.pin) await call('POST', `/api/posts/${res.id}/pin`, { as: staff, date: p.date });
  const pool = p.commenters ?? (p.key ? [...members.get(p.key)].filter(([, r]) => r !== 'pending').map(([n]) => n) : []);
  const list = Array.isArray(p.comments)
    ? p.comments
    : shuffle(pool.filter((n) => n !== p.author)).slice(0, p.comments ?? 0).map((n) => [n, pick(COMMENT_POOL)]);
  let d = p.date;
  for (const [name, text] of list) {
    if (R() < 0.35 && d < '2027-01-19' && d < (p.until ?? '2027-01-19')) d = addDays(d, 1);
    await call('POST', `/api/posts/${res.id}/comments`, { as: U(name), date: d, time: timeAt(), body: { body: text } });
    commentCount++;
  }
  const likers = shuffle(p.likers ?? [...users.keys()].filter((n) => n !== p.author && n !== '기후시민팀')).slice(0, p.likes ?? 0);
  for (const name of likers) {
    await call('POST', `/api/posts/${res.id}/like`, { as: U(name), date: p.date });
    likeCount++;
  }
  if (p.hide) await call('POST', `/api/posts/${res.id}/hide`, { as: staff, date: p.hide });
  return res.id;
}

// ---- campaigns --------------------------------------------------------------

const campaigns = new Map(); // key → { id, type, host }
const parts = new Map(); // `${campaignKey}:${name}` → participation id
let participationCount = 0, recordCount = 0, measurementCount = 0, subscriptionCount = 0;

async function campaign(key, def) {
  const { missions, tools, files, explainer, publish, created = '2026-12-20', ...body } = def;
  const res = await call('POST', '/api/campaigns', { as: 'admin', date: created, body });
  const id = res.campaign.id;
  campaigns.set(key, { id, type: body.type, host: def.hostKey });
  if (missions) await call('PUT', `/api/campaigns/${id}/missions`, { as: 'admin', date: created, body: missions });
  if (tools) await call('PUT', `/api/campaigns/${id}/tools`, { as: 'admin', date: created, body: tools });
  for (const f of files ?? []) {
    await call('POST', `/api/campaigns/${id}/files`, { as: 'admin', date: created, body: { name: f.name, mime: 'text/plain', dataBase64: b64(f.text) } });
  }
  if (explainer) await call('PUT', `/api/campaigns/${id}/explainer`, { as: 'admin', date: explainer.date ?? created, body: { title: explainer.title, body: explainer.body } });
  await call('POST', `/api/campaigns/${id}/publish`, { as: 'admin', date: created, body: publish });
  return id;
}

async function measure(name, { date, answers, campaignKey, kind = 'plain', place }) {
  const body = { answers, place: place ?? (campaignKey ? 'campaign' : 'home'), kind };
  if (campaignKey) body.campaignId = campaigns.get(campaignKey).id;
  const r = await call('POST', '/api/measurements', { as: U(name), date, time: timeAt(), body });
  measurementCount++;
  return r.measurement;
}

async function participate(key, name, date, body, time) {
  const c = campaigns.get(key);
  const r = await call('POST', `/api/campaigns/${c.id}/participate`, { as: U(name), date, time: time ?? timeAt(), body });
  parts.set(`${key}:${name}`, r.participation.id);
  participationCount++;
  if (!r.waitlisted && (c.type !== 'signature' || body.joinHost)) markJoined(c.host, name);
  return r;
}

const practiceBody = (startMeasurementId) => ({
  answers: {}, consents: { host: true, research: R() < 0.7 },
  reminder: { enabled: true, time: '20:00', channel: R() < 0.8 ? 'push' : 'email' },
  ...(startMeasurementId ? { startMeasurementId } : {}),
});

async function record(key, name, slot, fields, date = slot) {
  await call('PUT', `/api/participations/${parts.get(`${key}:${name}`)}/records/${slot}`, { as: U(name), date, time: '21:10', body: fields });
  recordCount++;
}

async function subscribe(key, name, date) {
  await call('POST', `/api/campaigns/${campaigns.get(key).id}/subscribe`, { as: U(name), date, time: timeAt() });
  subscriptionCount++;
}

// slots helpers (same rules as shared/src/missions.ts recordSlots)
function slots(cycle, runStart, runDays) {
  const off = [];
  if (cycle === 'daily') for (let i = 0; i < runDays; i++) off.push(i);
  else if (cycle === 'thrice_weekly') { for (let b = 0; b * 7 < runDays; b++) for (const k of [0, 2, 4]) if (b * 7 + k < runDays) off.push(b * 7 + k); }
  else if (cycle === 'weekly') for (let b = 0; b * 7 < runDays; b++) off.push(Math.min(b * 7 + 6, runDays - 1));
  return off.map((o) => addDays(runStart, o));
}

const noSlots = () => ({ detail: 'none', before: 'none', running: 'none', final: 'none', signed: 'none', closed: 'none', event: 'none', after: 'none' });

const practice = (over) => ({
  mode: 'online', slots: noSlots(), blockToolId: null, heroEnabled: false, capacity: null, reminderTime: '20:00',
  startPoint: { enabled: false, toolId: 'calculator' }, extraConsents: [], recordEnabled: true, missionCycle: 'weekly',
  recordCycle: 'daily', recordFields: ['check', 'memo'], recordToolId: null, missedAlert: true, ...over,
});

const WEEKLY_15 = [
  { round: 1, category: '이동', title: '출퇴근은 대중교통·자전거·걷기로', description: '이번 주에는 차 대신 버스·지하철·자전거·걷기로 다녀 보세요. 한 구간만 바꿔도 좋아요.', extraFields: [] },
  { round: 2, category: '먹거리', title: '하루 한 끼 채식, 남김 없이 먹기', description: '고기 대신 채소·두부·콩으로 한 끼를 차려 보세요. 외식이라면 채식 메뉴를 골라도 좋아요.', extraFields: [] },
  { round: 3, category: '에너지', title: '대기전력 끄기, 난방 온도 1도 낮추기', description: '안 쓰는 플러그를 뽑고, 난방 온도를 1도 낮춰 보세요. 내복 한 벌이 도와줘요.', extraFields: [] },
  { round: 4, category: '소비', title: '새로 사지 않기, 다회용기 챙기기', description: '한 주 동안 꼭 필요한 것만 사고, 장 볼 때 장바구니와 다회용기를 챙겨요.', extraFields: [] },
];

// ---- main ---------------------------------------------------------------------

async function main() {
  console.log(`대상 Worker: ${API}`);
  token = (await call('POST', '/api/enter', { body: { passcode: PASSCODE } })).token;

  // admin calls before 기후시민팀 exists: role admin without a user id
  users.set('기후시민팀', { id: null, name: '기후시민팀' });
  const existing = await call('GET', '/api/campaigns', { as: 'admin' });
  const existingGroups = await call('GET', '/api/groups', { as: 'admin' });
  if ((existing.items?.length ?? 0) > 0 || (existingGroups.items?.length ?? 0) > 0) {
    if (!FORCE) {
      console.error(`이미 캠페인 ${existing.counts?.all ?? existing.items.length}개 · 모임 ${existingGroups.items.length}개가 있어요. 모두 지우고 다시 채우려면 SEED_FORCE=1을 붙여 주세요.`);
      process.exit(2);
    }
  }
  if (FORCE) {
    const r = await call('POST', '/api/sim/reset', { as: 'admin', body: { passcode: PASSCODE } });
    console.log(`체험 데이터 초기화: 표 ${r.cleared}개`);
  }
  users.delete('기후시민팀');

  // 1. 사람들 ------------------------------------------------------------------
  const mkUser = async (name, sido, sigungu, date) => {
    const u = await call('POST', '/api/users', { date, body: { nickname: name, sido, sigungu, consents: { terms: true, privacy: true, research: R() < 0.6 } } });
    users.set(name, { id: u.id, name, sido, sigungu });
  };
  for (const [name, sido, sigungu] of POOL) await mkUser(name, sido, sigungu, dateBetween('2026-06-01', '2027-01-03'));
  for (const [name, sido, sigungu] of GENERIC) await mkUser(name, sido, sigungu, dateBetween('2025-10-01', '2026-12-20'));
  for (const [name, sido, sigungu, date] of NAMED) await mkUser(name, sido, sigungu, date);
  console.log(`사람 ${users.size}명`);

  // 2. 모임 (목록 화면 순서의 반대로 만들어요: 최근에 만든 모임이 위) ------------------
  await createGroup('online', '기후시민팀', {
    name: '온라인 1.5도 실천방', description: '동네 모임이 없는 분들이 온라인에서 함께 실천을 기록해요.', sido: '전국·온라인', joinPolicy: 'open',
    categories: ['공지', '인증', '자료', '자유'],
  }, '2026-01-05');
  await createGroup('hanppyeom', '기후정치바람', {
    name: '한뼘기후공간 운영자 모임', description: '거점 공간 운영자를 위한 공지와 이달의 실천 자료를 나눠요.', sido: '전국·온라인', joinPolicy: 'private',
    categories: ['공지', '이달의 실천', '자료', '자유'],
  }, '2026-10-15');
  await createGroup('critical', '두바퀴', {
    name: '크리티컬매스 서울', description: '매달 마지막 금요일, 자전거로 함께 도시를 달려요.', sido: '서울', sigungu: '', joinPolicy: 'open',
    categories: ['공지', '코스', '후기', '자유'],
  }, '2026-03-27');
  await createGroup('suwon', '수원지구인', {
    name: '수원 지구로운 모임', description: '수원에서 1.5도 워크숍을 마친 시민들의 실천 모임이에요.', sido: '경기', sigungu: '수원시', joinPolicy: 'open',
  }, '2026-07-20');
  await createGroup('mapo', '성산동주민', {
    name: '마포 햇빛발전 시민 모임', description: '동네 옥상 태양광과 시민 햇빛발전소를 함께 공부하고 탐방해요.', sido: '서울', sigungu: '마포구', joinPolicy: 'open',
    categories: ['공지', '탐방', '자료', '후기', '자유'],
  }, '2026-06-01');
  await createGroup('green', '마포살이', {
    name: '녹색평론 읽기 모임', description: '격주 화요일 저녁, 한 꼭지씩 읽고 이야기 나눠요.', sido: '서울', sigungu: '', joinPolicy: 'open',
    categories: ['공지', '발제', '후기', '자유'],
  }, '2026-05-12');
  await createGroup('academy', '바람개비', {
    name: '기후정책 아카데미 동문 모임', description: '아카데미 수료생이 정책 공부와 캠페인을 함께 기획해요.', sido: '전국·온라인', joinPolicy: 'approval',
    categories: ['공지', '자료', '정책 공부', '자유'],
  }, '2025-11-10');
  await createGroup('wonju', '초록걸음', {
    name: '원주 1.5도 참여자 모임',
    description: '1.5도 한달살기를 마친 원주 시민들이 매달 공동실천을 이어 가는 모임이에요. 공지·자료·활동 기록을 여기에 모아요.',
    sido: '강원', sigungu: '원주시', joinPolicy: 'open', chatLink: 'https://open.kakao.com/o/wonju15',
  }, '2026-04-02');
  await createGroup('info', '밤하늘', {
    name: '기후정보공유방', description: '매일 올라오는 기후 뉴스와 정책 동향을 함께 읽어요.', sido: '전국·온라인', joinPolicy: 'open',
    categories: ['공지', '뉴스', '질문', '자료', '자유'],
  }, '2025-09-01');

  // 멤버 · 운영진 (시안 숫자를 줄여서)
  await makeStaff('wonju', '햇빛부자', '2026-04-02');
  await makeStaff('wonju', '원주자전거', '2026-05-11');
  await join('wonju', '느린살림', '2026-09-03');
  for (const n of [...GEN.slice(11, 14), ...byRegion('원주').slice(0, 5)]) await join('wonju', n, dateBetween('2026-04-10', '2026-12-30'));
  await join('wonju', '바람개비', '2027-01-12');
  await join('wonju', '시민29', '2027-01-14'); // 춘천
  await join('wonju', byRegion('원주')[5], '2027-01-15');

  await makeStaff('info', '도시농부', '2025-09-20');
  const infoMembers = [...GEN, ...shuffle([...POOL_NAMES.filter((_, i) => i % 3 === 0), '바람개비', '햇살가득', '마포살이', '원주자전거', '성산동주민']).slice(0, 14), '햇빛부자'];
  for (const n of infoMembers) await join('info', n, dateBetween('2025-09-10', '2027-01-17'));

  await makeStaff('academy', '햇살가득', '2025-11-12');
  for (const n of ['마포살이', '성산동주민', '시민04', '시민07', '시민09', '시민15', '시민19', '시민23', '은평주민01', '관악주민02']) await join('academy', n, dateBetween('2025-11-20', '2026-12-10'));
  await pending('academy', '시민16', '2027-01-17');
  await pending('academy', '수원주민03', '2027-01-18');

  for (const n of ['바람개비', '성산동주민', '시민01', '시민02', '시민05', '시민08', '시민16', '은평주민02', '마포주민03']) await join('green', n, dateBetween('2026-05-15', '2026-12-30'));
  await makeStaff('mapo', '바람개비', '2026-06-03');
  for (const n of ['마포살이', '시민01', '시민02', '시민03', '시민18', ...byRegion('마포').slice(0, 7)]) await join('mapo', n, dateBetween('2026-06-05', '2027-01-10'));
  await makeStaff('suwon', '시민09', '2026-07-22');
  for (const n of ['시민10', '시민11', ...byRegion('수원').slice(0, 6), '시민19']) await join('suwon', n, dateBetween('2026-07-25', '2027-01-08'));
  for (const n of ['시민01', '시민07', '시민15', '시민16', '시민17', '바람개비', '성북주민01', '노원주민01', '강동주민01', '마포주민05', '은평주민04']) await join('critical', n, dateBetween('2026-04-01', '2027-01-15'));
  await makeStaff('critical', '시민17', '2026-05-02');
  for (const n of ['느린살림', '시민14', '시민24', '시민25', '도시농부']) await join('online', n, dateBetween('2026-01-10', '2026-12-30'));

  // 3. 캠페인 -------------------------------------------------------------------
  const G = (k) => groups.get(k).id;

  await campaign('jak2026', {
    created: '2026-01-10', type: 'practice', title: '작심삼일 · 1.5도 한달살기 (2026)', hostKey: 'online', hostGroupId: G('online'),
    summary: '2026년에 처음 열린 1.5도 한달살기 캠페인이에요. 참여자들의 후기를 볼 수 있어요.',
    schedule: { recruitStart: '2026-01-12', recruitEnd: '2026-02-05', runStart: '2026-02-06', runDays: 30 },
    settings: practice({ mode: 'online', startPoint: { enabled: true, toolId: 'calculator' }, missionCycle: 'weekly', recordFields: ['check', 'memo', 'photo'] }),
    missions: [...WEEKLY_15, { round: 5, category: '마무리', title: '다시 재고 한 달 돌아보기', description: '계산기로 다시 재고, 계속 지킬 실천 하나를 정해요.', extraFields: [] }],
    publish: { mode: 'now', showUpcoming: false, hero: false },
  });
  await campaign('wonju1', {
    created: '2026-02-10', type: 'practice', title: '원주 1.5도 한달살기 1기', hostKey: 'wonju', hostGroupId: G('wonju'),
    summary: '원주에서 처음 함께한 1.5도 한달살기예요. 매주 원주 참여자 모임에서 만났어요.',
    schedule: { recruitStart: '2026-02-15', recruitEnd: '2026-03-01', runStart: '2026-03-02', runDays: 30 },
    settings: practice({ mode: 'hybrid', startPoint: { enabled: true, toolId: 'calculator' } }),
    missions: [...WEEKLY_15, { round: 5, category: '마무리', title: '다시 재고 한 달 돌아보기', extraFields: [] }],
    publish: { mode: 'now', showUpcoming: false, hero: false },
  });
  await campaign('han12', {
    created: '2026-11-15', type: 'practice', title: '한뼘기후공간 · 12월의 실천', hostKey: 'hanppyeom', hostGroupId: G('hanppyeom'),
    summary: '전국 한뼘기후공간에서 함께한 12월 이달의 실천이에요. 인증 결과를 볼 수 있어요.',
    schedule: { recruitStart: '2026-11-20', recruitEnd: '2026-12-01', runStart: '2026-12-01', runDays: 31 },
    settings: practice({ mode: 'offline', missionCycle: 'whole', recordCycle: 'thrice_weekly', recordFields: ['check', 'memo', 'photo'] }),
    missions: [{ round: 1, category: '소비', title: '12월의 실천: 장바구니 챙기기', description: '장 보러 갈 때 장바구니를 챙기고, 비닐봉투를 받지 않아요. 한뼘기후공간 포스터의 QR로 인증해요.', extraFields: [] }],
    publish: { mode: 'now', showUpcoming: false, hero: false },
  });
  await campaign('book', {
    created: '2026-12-10', type: 'practice', title: '한 달에 기후 책 한 권', hostKey: 'green', hostGroupId: G('green'),
    summary: '한 달 동안 기후 책 한 권을 함께 읽고, 매주 읽은 쪽수와 한 줄 생각을 기록해요.',
    schedule: { recruitStart: '2026-12-14', recruitEnd: '2026-12-31', runStart: '2027-01-01', runDays: 31 },
    settings: practice({ mode: 'online', missionCycle: 'whole', recordCycle: 'weekly', recordFields: ['check', 'memo', 'number'], numberUnit: '쪽', numberGoal: 300 }),
    missions: [{ round: 1, category: '읽기', title: '이달의 책 『성장 이후의 삶』 함께 읽기', description: '매주 읽은 쪽수와 마음에 남은 한 줄을 남겨요. 격주 화요일 모임에서 이야기 나눠요.', extraFields: [] }],
    publish: { mode: 'now', showUpcoming: false, hero: false },
  });
  await campaign('han1', {
    created: '2026-12-18', type: 'practice', title: '한뼘기후공간 · 1월의 실천', hostKey: 'hanppyeom', hostGroupId: G('hanppyeom'),
    summary: '가까운 한뼘기후공간 포스터의 QR로 참여해요. 이달의 실천 미션을 하고 인증을 남겨요.',
    schedule: { recruitStart: '2026-12-20', recruitEnd: '2027-01-01', runStart: '2027-01-01', runDays: 31 },
    settings: practice({ mode: 'offline', missionCycle: 'whole', recordCycle: 'thrice_weekly', recordFields: ['check', 'memo', 'photo'] }),
    missions: [{ round: 1, category: '에너지', title: '1월의 실천: 실내 온도 20도 지키기', description: '난방 온도를 20도에 맞추고 내복·덧신으로 따뜻하게 지내요. 한뼘기후공간 포스터의 QR로 인증해요.', extraFields: [] }],
    publish: { mode: 'now', showUpcoming: false, hero: false },
  });
  await campaign('newyear', {
    created: '2026-12-28', type: 'practice', title: '새해 1.5도 한달살기', hostKey: 'online', hostGroupId: G('online'),
    summary: '설 연휴가 지나면 4주 동안 함께 실천해요. 계산기로 출발점을 재고 매일 미션을 기록해요.',
    schedule: { recruitStart: '2027-01-04', recruitEnd: '2027-01-31', runStart: '2027-02-08', runDays: 28 },
    settings: practice({ mode: 'hybrid', heroEnabled: true, startPoint: { enabled: true, toolId: 'calculator' }, missionCycle: 'weekly', recordCycle: 'daily', recordFields: ['check', 'memo', 'photo'] }),
    missions: WEEKLY_15,
    tools: [{ toolId: 'calculator' }],
    files: [
      { name: '1.5도 한달살기 진행 가이드.txt', text: '1.5도 한달살기 진행 가이드 (체험용 예시 자료)\n\n1. 시작 전: 1.5도 계산기로 출발점 재기\n2. 1–4주차: 주제별 미션을 하고 매일 기록하기\n3. 매주 일요일 저녁: 온라인 돌아보기 모임\n4. 마무리: 다시 재고 후기 남기기, 동네 모임으로 이어 가기\n' },
      { name: '1.5도 라이프스타일 감축카드.txt', text: '1.5도 라이프스타일 감축카드 (체험용 예시 자료)\n\n이동 · 먹거리 · 에너지 · 소비 네 묶음의 카드로 주간 돌아보기 모임에서 함께 써요.\n' },
    ],
    publish: { mode: 'now', showUpcoming: false, hero: true },
  });
  await campaign('signature', {
    created: '2027-01-03', type: 'signature', title: '우리 동네 기후예산 요구 서명', hostKey: 'academy', hostGroupId: G('academy'),
    summary: '동네 예산에 기후 대응 항목을 늘려 달라는 시민 요구안에 서명해요. 모인 서명은 구의회에 전달해요.',
    schedule: { recruitStart: '2027-01-04', recruitEnd: '2027-02-28', deliveryDate: '2027-03-10' },
    settings: {
      mode: 'online', slots: noSlots(), blockToolId: null, heroEnabled: false,
      demandSummary: '우리 구의 2028년 예산에 기후 대응 항목(건물 에너지 효율, 대중교통, 녹지)을 늘리고, 예산을 짜는 과정에 시민 의견을 듣는 절차를 마련해 주세요.',
      goal: 3000, countDisplay: 'count_and_rate', fields: ['nickname', 'region'], hostJoin: 'ask', regionalCounts: true, goalAlerts: true,
      deliveryNotice: true, deliveryTarget: '각 구의회 (사는 지역별로 묶어 전달)',
    },
    files: [
      { name: '우리 동네 예산서 읽는 법.txt', text: '우리 동네 예산서 읽는 법 (체험용 예시 교안)\n\n우리 구 예산서에서 기후 항목을 찾아봐요. 세출 예산 사업명세서에서 「환경」 「교통」 「주택」 분야를 먼저 살펴요.\n' },
      { name: '도넛 정책제안 워크숍 도구.txt', text: '도넛 정책제안 워크숍 도구 (체험용 예시 자료)\n\n요구안을 만든 워크숍에서 썼어요. 사회적 기초와 생태적 한계 사이에서 우리 동네 정책을 찾아봐요.\n' },
    ],
    explainer: {
      date: '2027-01-04', title: '왜 이 요구안을 냈나요',
      body: '우리 구 예산서에서 기후 대응 항목을 찾아보니 전체 예산의 2% 안팎이었어요. 건물 에너지 효율 개선, 마을버스 노선 확대, 동네 녹지처럼 주민이 바로 체감하는 사업은 해마다 줄었어요.\n\n그래서 2028년 예산부터는 기후 항목을 늘리고, 예산을 짜기 전에 주민 의견을 듣는 자리를 만들어 달라고 요구하려 해요. 서명은 사는 지역의 의회로 전달돼요.\n\n우리 구 기후예산, 얼마나 될까요? 구별 2027년 예산 가운데 기후 대응 항목의 비중은 마포구 2.1% · 은평구 1.8% · 관악구 1.6% · 서울 25개 구 평균 2.4%예요.',
    },
    publish: { mode: 'now', showUpcoming: false, hero: false },
  });
  await campaign('flogging', {
    created: '2027-01-04', type: 'offline', title: '1월 공동실천의 날 · 원주천 플로깅', hostKey: 'wonju', hostGroupId: G('wonju'),
    summary: '원주천 둔치를 함께 걸으며 쓰레기를 주워요. 끝나고 따뜻한 차를 나눠요.',
    schedule: { recruitStart: '2027-01-05', recruitEnd: '2027-01-16', eventDate: '2027-01-18', eventStart: '10:00', eventEnd: '12:00' },
    settings: {
      mode: 'offline', slots: noSlots(), blockToolId: null, heroEnabled: false,
      place: { exact: '원주천 둔치 단계교 아래 쉼터 (원주시 단계동)', public: '원주시 단계동 원주천 둔치' }, capacity: 30, waitlist: false,
      askCompanions: true, askTransport: false, photoConsent: true, supplies: '장갑, 집게, 다회용 물병. 집게가 없으면 운영진이 빌려 드려요.',
      attendance: 'roster', preNotice: true, changeNotice: true, reviewRequest: true,
    },
    publish: { mode: 'now', showUpcoming: false, hero: false },
  });
  await campaign('rooftop', {
    created: '2027-01-03', type: 'offline', title: '옥상 태양광 탐방 · 1월', hostKey: 'mapo', hostGroupId: G('mapo'),
    summary: '마포의 시민 햇빛발전소 옥상을 함께 둘러보고, 설치와 운영 이야기를 들어요.',
    schedule: { recruitStart: '2027-01-04', recruitEnd: '2027-01-23', recruitEndTime: '18:00', eventDate: '2027-01-25', eventStart: '14:00', eventEnd: '16:00' },
    settings: {
      mode: 'offline', slots: noSlots(), blockToolId: null, heroEnabled: false,
      place: { exact: '마포구 성미산로 ○○ 3층 옥상 · 건물 1층에서 운영진이 안내해요', public: '마포구 성산동' }, capacity: 20, waitlist: true,
      askCompanions: true, askTransport: false, photoConsent: true, supplies: '편한 신발, 모자, 물. 옥상은 바람이 세니 겉옷을 챙겨 주세요.',
      attendance: 'qr', preNotice: true, changeNotice: true, reviewRequest: true,
    },
    files: [{ name: '햇빛발전소 견학 진행안.txt', text: '햇빛발전소 견학 진행안 (체험용 예시 자료)\n\n탐방 순서와 옥상 안전 수칙을 담았어요. 난간 가까이 가지 않기, 패널 위에 올라가지 않기.\n' }],
    publish: { mode: 'now', showUpcoming: false, hero: false },
  });
  await campaign('wonju2', {
    created: '2027-01-12', type: 'practice', title: '원주 1.5도 한달살기 2기', hostKey: 'wonju', hostGroupId: G('wonju'),
    summary: '원주에서 함께하는 두 번째 1.5도 한달살기예요. 매주 원주 참여자 모임에서 만나요.',
    schedule: { recruitStart: '2027-01-25', recruitStartTime: '10:00', recruitEnd: '2027-02-12', runStart: '2027-02-15', runDays: 28 },
    settings: practice({ mode: 'hybrid', startPoint: { enabled: true, toolId: 'calculator' }, recordFields: ['check', 'memo', 'photo'] }),
    missions: WEEKLY_15,
    publish: { mode: 'scheduled', showUpcoming: true, hero: false },
  });
  await campaign('bike', {
    created: '2027-01-14', type: 'practice', title: '자전거 출퇴근 한 달', hostKey: 'critical', hostGroupId: G('critical'),
    summary: '한 달 동안 자전거로 출퇴근하고 매일 이동 거리를 기록해요.',
    schedule: { recruitStart: '2027-02-08', recruitEnd: '2027-02-28', runStart: '2027-03-01', runDays: 31 },
    settings: practice({ mode: 'offline', missionCycle: 'whole', recordCycle: 'daily', recordFields: ['check', 'number'], numberUnit: 'km' }),
    missions: [{ round: 1, category: '이동', title: '자전거로 출퇴근하기', description: '출퇴근 한 구간이라도 자전거로 달리고, 달린 거리를 km로 남겨요.', extraFields: [] }],
    publish: { mode: 'scheduled', showUpcoming: true, hero: false },
  });
  console.log(`캠페인 ${campaigns.size}개`);

  // 4. 지난 캠페인 참여 ------------------------------------------------------------
  // 작심삼일 (2026): 햇빛부자 28 / 30일 · 11.8 → 10.4톤
  const m1 = await measure('햇빛부자', { date: '2026-02-01', answers: sunny(10, 30), campaignKey: 'jak2026', kind: 'start' });
  await participate('jak2026', '햇빛부자', '2026-02-01', practiceBody(m1.id));
  const jakOthers = ['초록걸음', '원주자전거', '느린살림', '시민05', '시민12', '시민14', '시민21', '시민24', '시민25', '시민27', '은평주민05', '마포주민08', '관악주민04', '수원주민05'];
  for (const [i, n] of jakOthers.entries()) {
    const d = dateBetween('2026-01-12', '2026-02-05');
    const m = i % 2 === 0 ? await measure(n, { date: d, answers: answersFor(100 + i), campaignKey: 'jak2026', kind: 'start' }) : null;
    await participate('jak2026', n, d, practiceBody(m?.id));
  }
  const jakSlots = slots('daily', '2026-02-06', 30);
  const jakMemo = ['버스로 출근했어요', '점심은 비빔밥', '플러그 뽑기 완료', '장바구니 챙겼어요', '자전거로 장 보러 갔어요', '남김 없이 먹었어요', '난방 1도 낮췄어요'];
  for (const [i, s] of jakSlots.entries()) {
    if (i === 9 || i === 10) continue; // 이틀 쉬어 감 → 28 / 30
    await record('jak2026', '햇빛부자', s, { check: i % 6 === 5 ? 'partial' : 'done', ...(i % 3 === 0 ? { memo: jakMemo[i % jakMemo.length] } : {}) });
  }
  for (const n of ['초록걸음', '원주자전거', '시민05']) {
    for (const s of jakSlots.filter((_, i) => i % 5 === 0)) await record('jak2026', n, s, { check: pick(['done', 'done', 'partial']) });
  }
  await measure('햇빛부자', { date: '2026-03-07', answers: sunny(8, 23), campaignKey: 'jak2026', kind: 'end' });
  await measure('초록걸음', { date: '2026-03-07', answers: answersFor(300), campaignKey: 'jak2026', kind: 'end' });
  await post({
    campaign: campaigns.get('jak2026').id, author: '햇빛부자', category: '후기', date: '2026-03-07', time: '21:30',
    title: '28일 기록 완주! 작심삼일이 한 달이 됐어요',
    body: '처음엔 사흘만 해 보자는 마음이었는데 어느새 한 달이 지났어요. 출퇴근을 버스로 바꾼 게 제일 컸고, 다시 재 보니 1.4톤이 줄었어요. 원주에서 같이 이어 갈 분들 모임에서 만나요!',
    comments: [['초록걸음', '고생하셨어요! 원주 모임에서 꼭 이어 가요.'], ['원주자전거', '버스 출근 저도 따라 해 볼게요.']],
  });

  // 원주 1기
  for (const n of ['초록걸음', '원주자전거', '시민12', '시민13', '원주주민01', '원주주민02', '원주주민03', '느린살림']) {
    const d = dateBetween('2026-02-15', '2026-03-01');
    await participate('wonju1', n, d, practiceBody());
  }
  for (const s of slots('daily', '2026-03-02', 30).filter((_, i) => i % 4 === 0)) {
    await record('wonju1', '초록걸음', s, { check: 'done' });
    await record('wonju1', '원주자전거', s, { check: pick(['done', 'partial']) });
  }

  // 한뼘 12월
  const han12People = ['시민14', '시민15', '시민20', '시민21', '시민22', '시민26', '시민27', '시민28', '시민30', '강릉주민01', '천안주민01', '포항주민01'];
  for (const n of han12People) await participate('han12', n, dateBetween('2026-11-20', '2026-12-01'), practiceBody());
  const han12Slots = slots('thrice_weekly', '2026-12-01', 31);
  for (const [i, n] of han12People.slice(0, 8).entries()) {
    for (const s of han12Slots.filter((_, k) => (k + i) % 3 === 0)) await record('han12', n, s, { check: pick(['done', 'done', 'partial']), ...(R() < 0.25 ? { alsoPost: true, memo: pick(['장바구니 챙겼어요', '비닐 대신 에코백', '시장에서 봉투 없이 샀어요']) } : {}) });
  }

  // 5. 지금(1. 19.) 진행 중인 캠페인 참여 ----------------------------------------------
  // 한 달에 기후 책 한 권: 매주 쪽수
  const bookPeople = ['마포살이', '바람개비', '성산동주민', '시민01', '시민02', '시민05', '시민08', '시민16', '은평주민02', '마포주민03', '마포주민10', '성북주민02'];
  for (const n of bookPeople) await participate('book', n, dateBetween('2026-12-14', '2026-12-31'), practiceBody());
  const bookMemo = ['성장 말고 무엇을 목표로 삼을지 생각해 봤어요', '「충분함」이라는 말이 오래 남아요', '2장이 제일 어려웠어요', '돌봄 이야기에 밑줄 그었어요', '모임에서 이야기하고 싶은 쪽 표시해 뒀어요'];
  for (const [i, n] of bookPeople.entries()) {
    const w1 = 40 + Math.floor(R() * 60);
    await record('book', n, '2027-01-07', { check: 'done', number: w1, memo: pick(bookMemo) });
    if (i % 4 !== 3) await record('book', n, '2027-01-14', { check: i % 5 === 4 ? 'partial' : 'done', number: 30 + Math.floor(R() * 70), memo: pick(bookMemo), ...(i < 3 ? { alsoPost: true } : {}) }, i % 3 === 1 ? '2027-01-15' : '2027-01-14');
  }

  // 한뼘 1월: 일주일에 세 번, 사이사이 빈 날
  const han1People = ['시민14', '시민15', '시민20', '시민21', '시민22', '시민26', '시민27', '시민28', '시민30', '시민06', '시민17', '시민18', '노원주민02', '고양주민01', '용인주민01', '파주주민01', '인천주민01', '강동주민02', '해운대주민01', '천안주민02'];
  for (const n of han1People) await participate('han1', n, dateBetween('2026-12-20', '2027-01-01'), practiceBody());
  const han1Slots = slots('thrice_weekly', '2027-01-01', 31).filter((s) => s < '2027-01-19');
  const han1Memo = ['거실 온도계 20도 맞췄어요', '내복 입으니 견딜 만해요', '덧신 신고 지냈어요', '아이 방만 21도로 뒀어요', '창문 뽁뽁이 붙였어요', '오늘은 추워서 22도…'];
  for (const [i, n] of han1People.entries()) {
    const skipFrom = i % 4 === 0 ? 4 : i % 4 === 1 ? 6 : 99; // 일부는 중간부터 기록이 끊겨요
    for (const [k, s] of han1Slots.entries()) {
      if (k >= skipFrom || (k + i) % 5 === 4) continue;
      await record('han1', n, s, { check: pick(['done', 'done', 'done', 'partial', 'none']), ...(R() < 0.4 ? { memo: pick(han1Memo) } : {}), ...(R() < 0.15 ? { alsoPost: true } : {}) });
    }
  }

  // 6. 계산기 · 새해 1.5도 한달살기 신청 (출발점 포함) ----------------------------------
  const m3 = await measure('햇빛부자', { date: '2027-01-10', answers: sunny(10, 26), campaignKey: 'newyear', kind: 'start' });
  const newyearPeople = shuffle([
    '원주자전거', '느린살림', '도시농부', '밤하늘', '햇살가득', '시민03', '시민04', '시민06', '시민07', '시민10', '시민11', '시민12', '시민13',
    '시민19', '시민20', '시민22', '시민23', '시민24', '시민25', '시민26', '시민29', '시민30', '마포주민01', '마포주민02', '마포주민04',
    '은평주민03', '은평주민06', '은평주민07', '관악주민01', '관악주민03', '수원주민01', '수원주민02', '원주주민04', '원주주민05',
    '원주주민06', '고양주민02', '노원주민01', '성북주민01', '강동주민01',
  ]);
  const applied = [];
  for (const [i, n] of newyearPeople.entries()) {
    const d = dateBetween('2027-01-04', '2027-01-19');
    applied.push([d, n, i]);
  }
  applied.push(['2027-01-11', '햇빛부자', -1]);
  applied.sort((a, b) => a[0].localeCompare(b[0]));
  for (const [d, n, i] of applied) {
    let mid = n === '햇빛부자' ? m3.id : null;
    if (!mid && i % 5 !== 4) mid = (await measure(n, { date: d, answers: answersFor(500 + i), campaignKey: 'newyear', kind: 'start' })).id;
    await participate('newyear', n, d, practiceBody(mid));
  }
  // 계산기만 해 본 사람들 (홈 「참여자 평균」)
  for (const [i, n] of ['시민01', '시민02', '시민08', '시민09', '시민15', '시민16', '시민17', '시민18', '바람개비', '마포살이', '성산동주민', '두바퀴', '수원지구인', '초록걸음', '은평주민08', '관악주민05', '마포주민06'].entries()) {
    await measure(n, { date: dateBetween('2026-11-01', '2027-01-19'), answers: answersFor(800 + i) });
  }

  // 7. 서명 (지역별로 묶여 보이도록) ---------------------------------------------------
  const signers = [
    ...NAMED.map(([n]) => n).filter((n) => !['기후시민팀', '기후정치바람'].includes(n)),
    ...GEN, ...POOL_NAMES,
  ].map((n) => [n === '햇빛부자' ? '2027-01-12' : dateBetween('2027-01-04', '2027-01-19', R), n]).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [d, n] of signers) {
    const u = U(n);
    const academy = members.get('academy');
    const joinHost = !academy.has(n) && R() < 0.1;
    await participate('signature', n, d, { answers: { region: regionOf(u) }, consents: { delivery: true }, ...(joinHost ? { joinHost: true } : {}) });
  }

  // 8. 오프라인 모임 --------------------------------------------------------------
  // 옥상 태양광 탐방: 18 / 20석 (동반 포함) + 대기 2명
  const rooftop = [
    ['성산동주민', 0], ['바람개비', 1], ['마포살이', 0], ['시민01', 0], ['시민02', 1], ['시민03', 0], ['햇빛부자', 0], ['마포주민01', 0],
    ['마포주민02', 0], ['마포주민03', 1], ['마포주민04', 0], ['은평주민01', 0], ['은평주민02', 0], ['관악주민01', 0], ['시민18', 0],
  ];
  for (const [n, comp] of rooftop) await participate('rooftop', n, dateBetween('2027-01-04', '2027-01-17'), { answers: {}, consents: { host: true, photo: true }, companions: comp });
  await participate('rooftop', '마포주민09', '2027-01-18', { answers: {}, consents: { host: true, photo: true }, companions: 2 }); // 3석 > 남은 2석 → 대기
  await participate('rooftop', '은평주민09', '2027-01-19', { answers: {}, consents: { host: true, photo: true }, companions: 0 });

  // 원주천 플로깅 (1. 18. 끝남): 14명 신청, 10명 출석
  const floggers = ['초록걸음', '햇빛부자', '원주자전거', '느린살림', '시민12', '시민13', '시민14', '원주주민01', '원주주민02', '원주주민03', '원주주민04', '원주주민05', '원주주민06', '원주주민07'];
  for (const n of floggers) await participate('flogging', n, dateBetween('2027-01-05', '2027-01-15'), { answers: {}, consents: { host: true, photo: true }, companions: n === '느린살림' ? 1 : 0 });
  for (const n of floggers.slice(0, 10)) {
    await call('POST', `/api/participations/${parts.get(`flogging:${n}`)}/attend-manual`, { as: U('초록걸음'), date: '2027-01-18', time: `10:${pad(5 + Math.floor(R() * 20))}` });
  }

  // 9. 모집 예정 알림 신청 ----------------------------------------------------------
  for (const n of ['햇빛부자', '느린살림', '시민13', '시민29', '원주주민01', '원주주민03', '원주주민05', '원주주민08', '원주주민09', '바람개비', '시민12', '원주자전거']) await subscribe('wonju2', n, dateBetween('2027-01-12', '2027-01-19'));
  for (const n of ['두바퀴', '시민01', '시민07', '시민15', '시민16', '시민17', '바람개비', '성북주민01', '노원주민01', '강동주민01', '마포주민05', '은평주민04', '원주자전거', '시민03', '관악주민02']) await subscribe('bike', n, dateBetween('2027-01-14', '2027-01-19'));

  // 10. 모임 게시판 ----------------------------------------------------------------
  // 원주 1.5도 참여자 모임 (G · G-1 · G-2)
  await post({ key: 'wonju', author: '초록걸음', category: '후기', date: '2026-12-18', title: '한달살기 1기를 마치고 1년, 지금도 지키는 세 가지', body: '1기 때 시작한 것 중에 지금까지 남은 건 세 가지예요. 버스 정기권, 장바구니, 그리고 겨울 내복. 거창하지 않아도 오래 가는 게 제일이더라고요. 여러분은 무엇이 남았나요?', comments: 5, likes: 9 });
  await post({ key: 'wonju', author: '원주자전거', category: '활동 기록', date: '2026-12-22', title: '12월 공동실천의 날 기록: 장바구니 챙기기 31명 참여', body: '12월 공동실천의 날에 31명이 장바구니 챙기기를 인증했어요. 중앙시장 상인분들이 봉투 안 받는 손님이 늘었다고 하셨대요. 사진은 단톡방에 모아 두었어요.', comments: 3, likes: 8 });
  await post({ key: 'wonju', author: '원주자전거', category: '자료', date: '2027-01-10', title: '원주시 시내버스 노선 개편안 정리 (2027)', body: '시청 누리집에 올라온 2027년 시내버스 노선 개편안을 정리했어요. 단구동 · 무실동 쪽 배차가 늘고, 혁신도시 순환 노선이 새로 생겨요. 한달살기 이동 미션 때 참고하세요.', comments: 3, likes: 6 });
  await post({ key: 'wonju', author: '느린살림', category: '자유', date: '2027-01-10', title: '다회용기 받아 주는 단구동 반찬가게 찾았어요', body: '단구동 시장 안쪽 반찬가게에서 다회용기를 내밀었더니 흔쾌히 담아 주셨어요. 덤으로 멸치볶음도 조금 더 주셨어요 😊 다른 가게도 아시면 알려 주세요.', comments: 4, likes: 7 });
  await post({ key: 'wonju', author: '초록걸음', category: '공지', date: '2027-01-10', time: '20:00', title: '2월 공동실천 일정: 매주 토요일 원주천 걷기', body: '2월 공동실천은 매주 토요일 오전 10시 원주천 걷기예요. 단계교 아래 쉼터에서 모여 한 시간 걸어요. 한달살기 2기 참가자도 함께해요.', pin: true, comments: 2, likes: 5 });
  await post({ key: 'wonju', author: '시민13', category: '후기', date: '2027-01-11', title: '플로깅 사전 답사 다녀왔어요, 원주천 둔치 코스 공유', body: '18일 플로깅 코스를 미리 걸어 봤어요. 단계교에서 원주교까지 왕복 3km 정도이고, 다리 밑에 쓰레기가 많이 모여 있어요. 장갑은 두꺼운 걸로 챙기세요!', comments: 4, likes: 8 });
  await post({ key: 'wonju', author: '햇빛부자', category: '공지', date: '2027-01-06', title: '원주 1.5도 한달살기 2기 준비 모임 안내', body: '2기 모집이 1월 25일에 시작해요. 그 전에 1월 23일(토) 오후 2시 원주시청 앞 카페에서 준비 모임을 해요. 1기 참여자분들이 경험을 나눠 주시면 큰 힘이 돼요.', comments: 3, likes: 6 });
  await post({ key: 'wonju', author: '초록걸음', category: '공지', date: '2027-01-13', time: '19:00', title: '1월 공동실천의 날: 원주천 플로깅 함께해요 (1. 18. 토)', body: '1월 공동실천의 날은 원주천 플로깅이에요. 오전 10시 단계교 아래 쉼터에서 모여요. 집게와 봉투는 모임에서 준비하고, 장갑과 물병만 챙겨 오세요. 신청은 캠페인 화면에서 해 주세요.', pin: true, comments: 6, likes: 12 });
  await post({ key: 'wonju', author: '초록걸음', category: '활동 기록', date: '2027-01-13', time: '21:00', title: '한달살기 4주차 인증 모음: 대중교통 미션 성공률 72%', body: '지난 한달살기 4주차 인증을 모아 봤어요. 대중교통 미션은 열 명 중 일곱 명이 성공했고, 가장 많이 바꾼 구간은 출근길이었어요. 다음 기수 미션을 다듬는 데 쓸게요.', comments: 6, likes: 10 });
  await post({ key: 'wonju', author: '시민29', category: '자유', date: '2027-01-14', title: '겨울 패딩 최대 70% 할인, 링크 들어와 보세요', body: '오늘만 특가! 아래 쇼핑몰 링크에서 확인하세요 → shop.example', hide: '2027-01-14' });
  await post({ key: 'wonju', author: '햇빛부자', category: '후기', date: '2027-01-19', time: '09:30', title: '원주천 플로깅 다녀왔어요, 봉투 23개 모았어요', body: '어제 플로깅에 열 명이 넘게 와 주셨어요. 두 시간 동안 봉투 23개를 채웠고, 담배꽁초가 제일 많았어요. 끝나고 마신 유자차가 정말 따뜻했어요. 2월 걷기 때 또 만나요!', comments: 3, likes: 6, staffBy: '초록걸음' });

  // 기후정보공유방
  await post({ key: 'info', author: '도시농부', category: '자료', date: '2027-01-08', title: '우리 집 전기요금 고지서 읽는 법', body: '고지서에서 사용량(kWh), 누진 단계, 기후환경요금을 찾는 법을 정리했어요. 1.5도 계산기에 전기 사용량을 넣을 때도 이 숫자를 쓰면 돼요.', comments: 3, likes: 6 });
  await post({ key: 'info', author: '시민19', category: '뉴스', date: '2027-01-11', title: '탄소중립기본법 개정 논의, 어디까지 왔나', body: '국회 환경노동위원회에서 2035 감축목표를 법에 넣는 개정안이 논의되고 있어요. 쟁점과 일정을 기사 세 꼭지로 묶어 정리했어요.', comments: 4, likes: 9 });
  await post({ key: 'info', author: '시민22', category: '뉴스', date: '2027-01-13', title: '1월 한파와 전력 수요, 이번 주 전력거래소 자료 정리', body: '한파로 이번 주 전력 수요가 겨울 최고치를 다시 썼어요. 시간대별 수요와 태양광 발전량을 그래프로 비교해 봤어요.', comments: 3, likes: 8 });
  await post({ key: 'info', author: '시민04', category: '질문', date: '2027-01-14', time: '22:10', title: '아파트 베란다 태양광, 관리사무소 동의가 꼭 필요한가요?', body: '베란다에 미니 태양광을 달고 싶은데 관리사무소에서 입주자대표회의 동의가 필요하다고 해요. 다른 분들은 어떻게 하셨나요? 지자체 보조금 받을 때도 동의서가 필요한지 궁금해요.', comments: 7, likes: 6, until: '2027-01-18' });
  await post({ key: 'info', author: '시민11', category: '자유', date: '2027-01-15', title: '버스 정기권 할인, 지역별로 비교해 봤어요', body: '기후동행카드처럼 지역마다 생긴 정기권을 표로 정리했어요. 원주 · 수원 · 부산은 조건이 꽤 달라요. 빠진 지역 있으면 댓글로 알려 주세요.', comments: 4, likes: 7 });
  await post({ key: 'info', author: '시민20', category: '자유', date: '2027-01-16', title: '○○ 제품 공동구매 하실 분', body: '친환경 세제 공동구매 모집합니다. 아래 판매 링크로 신청해 주세요 → store.example/buy (1인 3개 이상)', comments: 1 });
  await post({ key: 'info', author: '시민23', category: '자료', date: '2027-01-17', title: '기후위기 대응 정책 토론회 다시 보기 링크 모음', body: '이번 주에 열린 정책 토론회 세 곳의 다시 보기 링크와 발제 자료를 모았어요. 지역 에너지 전환 세션이 특히 좋았어요.', comments: 3, likes: 6 });
  await post({ key: 'info', author: '밤하늘', category: '공지', date: '2027-01-02', title: '기후정보공유방 이용 안내 (2027년판)', body: '뉴스는 출처 링크와 함께, 질문은 「질문」 분류로 올려 주세요. 광고 · 판매 글은 운영진이 숨겨요.', pin: true, comments: 2, likes: 5 });
  await post({ key: 'info', author: '밤하늘', category: '뉴스', date: '2027-01-19', time: '08:20', title: '2027년 정부 기후대응기금 예산안, 무엇이 늘고 줄었나', body: '올해 기후대응기금 예산안을 항목별로 비교했어요. 건물 에너지 효율과 대중교통 지원은 늘었고, 지역 에너지 전환 사업은 줄었어요. 표와 함께 정리했으니 우리 동네 예산과도 견줘 보세요.', comments: 9, likes: 22 });

  // 녹색평론 읽기 모임
  await post({ key: 'green', author: '마포살이', category: '공지', date: '2027-01-05', title: '1월 모임 안내: 「성장 이후의 삶」 첫 꼭지', body: '1월 12일(화) 저녁 7시 반, 망원동 작은 책방에서 만나요. 첫 꼭지를 읽어 오시면 돼요.', pin: true, comments: 2, likes: 4 });
  await post({ key: 'green', author: '시민02', category: '후기', date: '2027-01-15', time: '23:00', title: '1월 모임 후기: 「성장 이후의 삶」을 읽고 나눈 이야기', body: '이번 모임에서는 「충분함」이라는 말을 오래 붙잡고 이야기했어요. 각자 집에서 줄일 수 있는 것과 동네에서 함께 바꿔야 할 것을 나눠 적어 봤어요. 다음 모임은 1월 26일(화)이에요.', comments: 6, likes: 8 });
  // 기후정책 아카데미 동문 모임
  await post({ key: 'academy', author: '바람개비', category: '공지', date: '2027-01-04', title: '기후예산 요구 서명을 시작했어요', body: '아카데미에서 함께 만든 요구안으로 서명을 시작했어요. 2월 28일까지 받고 3월 10일에 각 구의회에 전달해요. 주변에 많이 알려 주세요!', pin: true, comments: 3, likes: 9 });
  await post({ key: 'academy', author: '햇살가득', category: '자료', date: '2027-01-16', time: '10:30', title: '우리 동네 예산서 읽는 법 정리 (구의회 회의록 찾기 포함)', body: '구 누리집에서 예산서를 내려받고, 기후 관련 사업을 찾는 순서를 정리했어요. 구의회 회의록 검색에서 「기후」 「탄소」로 찾으면 예산 심의 때 나온 이야기도 볼 수 있어요.', comments: 5, likes: 12 });
  await post({ key: 'academy', author: '시민15', category: '자료', date: '2027-01-17', title: '탄소중립 교안 모음 공유해요', body: '여기저기서 모은 탄소중립 교안을 한 파일로 묶었어요. (탄소중립 교안 모음.zip) 출처는 따로 정리하지 못했어요.', comments: 1 });
  // 마포 햇빛발전 시민 모임
  await post({ key: 'mapo', author: '성산동주민', category: '후기', date: '2026-12-20', title: '12월 성미산 햇빛발전소 탐방 후기', body: '12월 탐방에는 열두 분이 오셨어요. 시민 출자로 세운 발전소가 한 해 동안 얼마나 전기를 만들었는지 들었어요.', comments: 3, likes: 6 });
  await post({ key: 'mapo', author: '성산동주민', category: '공지', date: '2027-01-05', title: '1월 옥상 태양광 탐방 신청 받아요 (1. 25. 월)', body: '1월 25일(월) 오후 2시, 성산동 시민 햇빛발전소 옥상을 둘러봐요. 정원 20명이고 신청은 캠페인 화면에서 해 주세요.', pin: true, comments: 3, likes: 7 });
  await post({ key: 'mapo', author: '시민03', category: '자유', date: '2027-01-14', title: '베란다 태양광 보조금, 마포구는 올해도 있나요?', body: '작년에는 구에서 베란다 태양광 설치비를 일부 지원했는데 올해 공고가 아직 안 보여요. 아시는 분 계세요?', comments: 3, likes: 3 });
  await post({ key: 'mapo', author: '바람개비', category: '자료', date: '2027-01-16', title: '시민 햇빛발전 협동조합 출자 안내 정리', body: '출자 방법, 배당, 탈퇴 절차를 한 장으로 정리했어요. 탐방 때 궁금한 점은 더 물어봐요.', comments: 2, likes: 5 });
  await post({ key: 'mapo', author: '마포주민02', category: '탐방', date: '2027-01-17', title: '망원동 주택가 옥상, 태양광 놓을 수 있을까요?', body: '저희 집 옥상이 남향이라 패널을 놓고 싶어요. 1월 탐방 때 여쭤보려고 사진 찍어 두었어요.', comments: 2, likes: 2 });
  // 수원 지구로운 모임
  await post({ key: 'suwon', author: '수원지구인', category: '공지', date: '2026-12-28', title: '1월 모임은 행궁동 공유공간에서 해요', body: '1월 모임은 1월 16일(토) 오후 3시 행궁동 공유공간에서 해요. 3월 한달살기 이야기도 나눠요.', comments: 2, likes: 3 });
  await post({ key: 'suwon', author: '시민10', category: '후기', date: '2027-01-16', time: '20:00', title: '1.5도 워크숍 수료생 1월 모임 후기', body: '열한 명이 모였어요. 수원에서도 한달살기를 열어 보자는 이야기가 나와서 연구소에 협업을 제안해 보기로 했어요.', comments: 3, likes: 4 });
  // 크리티컬매스 서울
  await post({ key: 'critical', author: '두바퀴', category: '공지', date: '2027-01-15', title: '1월 마지막 금요일(1. 29.) 라이딩 코스 안내', body: '1월 라이딩은 여의도 공원에서 저녁 7시에 출발해 마포대교를 건너 홍대 쪽으로 돌아와요. 전조등과 후미등은 꼭 챙겨 주세요.', pin: true, comments: 3, likes: 8 });
  await post({ key: 'critical', author: '시민16', category: '자유', date: '2027-01-17', title: '겨울 자전거 출퇴근, 장갑 추천해 주세요', body: '영하로 떨어지니 손이 제일 시려요. 브레이크 잡기 편하면서 따뜻한 장갑 있을까요?', comments: 3, likes: 4 });
  await post({ key: 'critical', author: '시민17', category: '공지', date: '2027-01-18', title: '자전거 출퇴근 한 달 캠페인, 3월에 열려요', body: '연구소와 함께 3월 한 달 자전거 출퇴근 캠페인을 열어요. 캠페인 화면에서 「알림 받기」를 눌러 두시면 모집 시작 때 알려 드려요.', comments: 2, likes: 6 });
  await post({ key: 'critical', author: '노원주민01', category: '후기', date: '2026-12-26', title: '12월 라이딩 후기: 크리스마스 불빛 코스', body: '추웠지만 서른 명 넘게 함께 달렸어요. 청계천 불빛 코스가 정말 예뻤어요.', comments: 2, likes: 5 });
  // 한뼘기후공간 운영자 모임 (비공개)
  await post({ key: 'hanppyeom', author: '기후정치바람', category: '공지', date: '2026-12-28', title: '1월의 실천 포스터 파일 올려요', body: '1월의 실천 「실내 온도 20도 지키기」 포스터와 QR 파일이에요. 각 공간 입구에 붙여 주세요.', pin: true, comments: [['시민14', '붙였어요! 사진은 단톡방에 올릴게요.'], ['시민21', '저희 공간도 내일 붙일게요.']] });
  await post({ key: 'hanppyeom', author: '기후정치바람', category: '이달의 실천', date: '2027-01-05', title: '12월 이달의 실천 결과 공유', body: '12월 「장바구니 챙기기」에 전국 공간에서 함께해 주셨어요. 인증이 가장 많았던 공간은 은평과 원주였어요. 고맙습니다.', comments: [['시민15', '다음 달도 열심히 알릴게요.']] });
  // 온라인 1.5도 실천방
  await post({ key: 'online', author: '기후시민팀', category: '공지', date: '2027-01-04', title: '새해 1.5도 한달살기 참가자를 모집해요', body: '설 연휴가 지나고 2월 8일부터 4주 동안 함께 실천해요. 신청 전에 1.5도 계산기로 출발점을 재 보세요.', pin: true, comments: 3, likes: 9 });
  await post({ key: 'online', author: '시민24', category: '인증', date: '2027-01-13', title: '오늘의 실천 인증: 텀블러 챙기기', body: '카페 두 번, 텀블러 두 번! 작은 것부터 다시 시작해요.', comments: 3, likes: 5 });
  await post({ key: 'online', author: '느린살림', category: '자유', date: '2027-01-15', title: '횡성에서도 함께해요, 시골 이동 미션은 어떻게 하죠?', body: '버스가 하루 몇 번 없는 동네라 이동 미션이 걱정이에요. 비슷한 동네 사는 분들은 어떻게 하셨나요?', comments: 3, likes: 6 });
  await post({ key: 'online', author: '시민25', category: '자료', date: '2027-01-17', title: '작심삼일 2026 참가자들이 뽑은 쉬운 미션 다섯 가지', body: '지난해 참가자 설문에서 「제일 쉬웠던 미션」을 모아 봤어요. 1위는 플러그 뽑기, 2위는 장바구니였어요.', comments: 3, likes: 7 });

  // 11. 캠페인 참가자 게시판 ---------------------------------------------------------
  const NY = campaigns.get('newyear').id;
  const nyPeople = applied.map(([, n]) => n);
  await post({ campaign: NY, author: '기후시민팀', category: '공지', date: '2027-01-04', title: '캠페인 시작 전 꼭 읽어 주세요: 기록 방법과 일정 안내', body: '2월 8일(월) 아침에 첫 미션을 알려 드려요. 매일 저녁 8시 알림이 오면 「했어요 · 조금 했어요 · 못 했어요」 중에 골라 기록하고, 원하면 한 줄 메모와 사진을 남겨요. 매주 일요일 저녁 9시에는 온라인으로 30분 돌아보기 모임을 해요.', pin: true, staffBy: '기후시민팀', commenters: nyPeople, comments: 2, likers: nyPeople, likes: 8 });
  await post({ campaign: NY, author: '시민20', category: '자료', date: '2027-01-15', title: '지난 기수 참여자가 정리한 대중교통 이용 팁', body: '작심삼일 때 이동 미션을 하면서 모은 팁이에요. 환승 할인 시간, 정기권, 자전거 거치대 위치까지 정리했어요.', commenters: nyPeople, comments: 3, likers: nyPeople, likes: 6 });
  await post({ campaign: NY, author: '시민06', category: '자유', date: '2027-01-16', title: '설 연휴 끝나고 첫 주, 다들 어떤 미션부터 하실 거예요?', body: '첫 주가 이동 미션이던데, 저는 출근길 한 정거장 먼저 내려 걷기부터 해 보려고요. 다들 계획 있으세요?', commenters: nyPeople, comments: 4, likers: nyPeople, likes: 5 });
  await post({ campaign: NY, author: '원주자전거', category: '인사', date: '2027-01-18', title: '원주에서 참여해요! 작년에 이어 두 번째예요', body: '작년 작심삼일에 이어 두 번째 참여예요. 원주 참여자 모임에서도 같이 해요. 반가워요!', commenters: nyPeople, comments: 2, likers: nyPeople, likes: 4 });
  await post({ campaign: NY, author: '시민23', category: '인사', date: '2027-01-18', title: '혼자 사는 직장인인데 끝까지 해 보고 싶어요', body: '작심삼일로 끝나지 않게 같이 북돋아 주세요. 퇴근이 늦어서 기록은 밤에 몰아서 할 것 같아요.', commenters: nyPeople, comments: 3, likers: nyPeople, likes: 6 });

  const RT = campaigns.get('rooftop').id;
  const rtPeople = rooftop.map(([n]) => n);
  const notice = await post({ campaign: RT, author: '성산동주민', category: '공지', date: '2027-01-04', title: '탐방 전에 읽어 주세요: 옥상 안전 수칙과 오는 길', body: '옥상에서는 난간 가까이 가지 않고, 패널 위에 올라가지 않아요. 망원역 2번 출구에서 걸어서 12분이에요. 주차 공간이 없어 대중교통을 권해요.', pin: true, staffBy: '성산동주민', commenters: rtPeople, comments: 1 });
  await post({ campaign: RT, author: '은평주민01', category: '자료', date: '2027-01-15', title: '지난 탐방 후기: 12월 성미산 햇빛발전소', body: '12월 탐방 때 들은 이야기를 정리했어요. 패널 청소는 일 년에 두 번이면 충분하대요.', commenters: rtPeople, comments: 2, likers: rtPeople, likes: 4 });
  await post({ campaign: RT, author: '시민02', category: '인사', date: '2027-01-18', title: '망원역에서 같이 걸어가실 분 계세요? 13:30에 2번 출구', body: '처음 가는 길이라 같이 걸어가실 분 있으면 좋겠어요. 13:30에 망원역 2번 출구에서 기다릴게요.', commenters: rtPeople, comments: 3, likers: rtPeople, likes: 3 });
  await post({ campaign: RT, author: '마포주민03', category: '인사', date: '2027-01-18', title: '베란다 태양광 설치한 지 1년, 궁금한 것 모아 갈게요', body: '베란다 태양광을 단 지 1년이 됐어요. 발전량 기록도 가져갈게요. 같이 비교해 봐요.', commenters: rtPeople, comments: 2, likers: rtPeople, likes: 3 });
  await call('PUT', `/api/campaigns/${RT}/checklist`, { as: 'admin', date: '2027-01-04', body: [{ label: '안전 수칙 읽기', linkType: 'post', target: notice }] });

  const FL = campaigns.get('flogging').id;
  await post({ campaign: FL, author: '초록걸음', category: '공지', date: '2027-01-12', title: '플로깅 준비물과 모이는 곳 안내', body: '1월 18일 오전 10시, 단계교 아래 쉼터에서 모여요. 장갑과 물병을 챙겨 오세요. 집게와 봉투는 모임에서 준비해요.', pin: true, staffBy: '초록걸음', commenters: floggers, comments: 2 });
  await post({ campaign: FL, author: '원주주민02', category: '후기', date: '2027-01-18', time: '15:00', title: '처음 와 본 플로깅, 생각보다 재밌었어요', body: '두 시간이 금방 갔어요. 다음 공동실천에도 꼭 올게요!', commenters: floggers, comments: 2, likers: floggers, likes: 5 });

  // 12. 협업 제안 · 신고 ------------------------------------------------------------
  await call('POST', '/api/collab', { as: U('기후정치바람'), date: '2027-01-18', time: '18:00', body: {
    title: '한뼘기후공간 · 2월의 실천 함께 기획', idea: '2월 이달의 실천을 「에너지 절약」으로 하고 싶어요. 포스터 QR은 저희가 배포할게요.',
    period: '2027. 2. 1.–2. 28.', size: '전국 한뼘기후공간 30곳 안팎', groupId: G('hanppyeom'),
  } });
  await call('POST', '/api/collab', { as: U('수원지구인'), date: '2027-01-19', time: '09:40', body: {
    title: '수원 1.5도 한달살기 1기', idea: '수원에서도 3월에 한달살기를 열고 싶어요. 주최 모임은 저희 모임으로 해 주세요.',
    period: '2027. 3월 (4주)', size: '30명 안팎', groupId: G('suwon'),
  } });
  const infoPosts = await call('GET', `/api/boards/group/${G('info')}/posts?q=${encodeURIComponent('공동구매')}`, { as: U('밤하늘') });
  const ad = infoPosts.items[0].id;
  for (const [n, d] of [['시민11', '2027-01-16'], ['시민19', '2027-01-16'], ['도시농부', '2027-01-17']]) {
    await call('POST', '/api/reports', { as: U(n), date: d, body: { targetType: 'post', targetId: ad, reason: '광고 · 외부 판매 링크가 들어 있어요' } });
  }
  const acPosts = await call('GET', `/api/boards/group/${G('academy')}/posts?q=${encodeURIComponent('교안 모음')}`, { as: U('바람개비') });
  await call('POST', '/api/reports', { as: U('햇살가득'), date: '2027-01-17', body: { targetType: 'post', targetId: acPosts.items[0].id, reason: '저작권 · 출처 없는 타 기관 교안이에요' } });

  console.log(`글 ${postCount}개 · 댓글 ${commentCount}개 · 공감 ${likeCount}개 · 참여 ${participationCount}건 · 기록 ${recordCount}건 · 측정 ${measurementCount}건 · 알림 신청 ${subscriptionCount}건`);

  // 13. 확인 (기준일 1. 19.) ------------------------------------------------------
  const hero = await call('GET', '/api/campaigns/hero');
  const list = await call('GET', '/api/campaigns');
  const pop = await call('GET', '/api/popular');
  const calc = await call('GET', '/api/aggregates/calculator');
  const glist = await call('GET', '/api/groups');
  console.log(`확인 · 홈 히어로: ${hero.campaign?.campaign?.title ?? '없음'}`);
  console.log(`확인 · 캠페인 ${JSON.stringify(list.counts)}`);
  console.log(`확인 · 모임 ${glist.items.length}개 · 인기 게시물 ${pop.items.length}개 (${pop.items.map((p) => p.title.slice(0, 12)).join(' / ')})`);
  console.log(`확인 · 계산기 참여자 평균 ${calc.avg?.toFixed(1)}톤 (${calc.count}명)`);
  console.log(`요청 ${sent}건`);
}

main().catch((e) => {
  console.error(`\n중단: ${e.message}\n(요청 ${sent}건 보냄) 다시 채우려면 SEED_FORCE=1을 붙여 다시 실행해 주세요.`);
  process.exit(1);
});
