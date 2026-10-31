# 기후시민플랫폼 체험 사이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Figma 「최종 Desktop」 시안을 여러 사람이 같은 데이터를 공유하며 역할 · 날짜를 바꿔 체험할 수 있는 반응형 웹사이트로 구현해 GitHub Pages에 배포한다.

**Architecture:** 정적 SPA(React + TypeScript + Vite, HashRouter)를 GitHub Pages에 올리고, 데이터는 Cloudflare Worker(REST API)가 Cloudflare D1(SQLite)에 저장한다. 날짜 · 캠페인 상태 · 미션 일정 · 계산기 같은 순수 규칙은 `shared/`에 두어 화면과 Worker가 함께 쓴다. 역할과 「내 날짜」는 브라우저마다 따로 저장하고 모든 API 요청 헤더로 보낸다.

**Tech Stack:** TypeScript 5, React 18, react-router-dom 6 (HashRouter), @tanstack/react-query 5, Vite 5, CSS Modules + CSS 변수, Vitest, @testing-library/react, better-sqlite3(테스트용 D1 대역), Cloudflare Workers + D1 + wrangler 4, Playwright(마지막 점검), qrcode(QR 이미지).

**Spec:** `docs/superpowers/specs/2026-10-31-climate-citizen-platform-sim-design.md` — 실행자는 계획과 함께 반드시 읽는다. 화면 세부 문구 · 배치는 Task 1이 만드는 `docs/figma/` 사본이 기준이다.

## Global Constraints

- 비용 0원: Cloudflare 무료 플랜(Workers 하루 10만 요청, D1), GitHub Pages(공개 저장소). R2 · 유료 서비스 금지.
- 저장소: GitHub `minskapo/climate-citizen-platform-sim`, 로컬 `/Users/minski/dev/climate-citizen-platform`.
- 화면 문구는 한국어, 시안의 말투("~해요"체). 글꼴 Asta Sans(Regular/Medium/Bold, Google Fonts).
- **화면에 개발용 표기를 넣지 않는다**: 화면 코드(H-2, D-1p…), 「플랫폼 공통 항목…」 주석 칩, 맞춤 영역 점선 라벨 금지. 맞춤 블록은 사용자 화면에서 테두리 없이 보인다.
- 체험 도구 막대(역할 · 활동명 · 내 날짜 · 초기화)만 실제 플랫폼에 없는 요소이며, 어두운 회색 막대로 구분한다.
- 입장 암호는 Worker secret `SIM_PASSCODE`(값은 저장소에 적지 않음 — 컨트롤러가 실행 시 전달). 토큰 없는 API 요청은 401.
- 파일 · 이미지 · HTML 1개당 1MB 이하. 이미지는 브라우저에서 긴 변 1280px JPEG(품질 0.75)로 줄여 저장.
- 하루 요청 80,000건 초과 시 쓰기 요청 거절(503, code `DAILY_CAP`).
- 알림 수 확인은 문서가 보이는 동안만 60초마다.
- 모든 "오늘"은 내 날짜(`X-Sim-Date`). 미션 기록 · 출석 · 계산기 측정은 내 날짜로 저장.
- 반응형 기준: ≥1200 데스크탑(시안), 768–1199 태블릿(옆 패널이 본문 아래), ≤767 모바일(좌우 16px, 메뉴 접기, 「1.5도 계산기」 버튼 항상 보임, 신청 창은 아래 시트, 주 버튼 하단 고정).
- 시드 데이터 없음. 빈 상태 화면을 모든 목록에 둔다.

## Review Focus

1. **날짜가 다른 두 사람이 같은 캠페인을 쓸 때** — A(내 날짜: 모집 중)와 B(내 날짜: 진행 15일째)가 동시에 쓰면, B의 기록은 저장되고 A의 화면은 오류 없이 "모집 중"으로 보여야 한다. 기록 날짜가 진행 기간 밖이면 Worker가 거절한다. → Task 9 테스트 `records outside run window are rejected`, Task 15 테스트 `status differs per viewer date`.
2. **활동명 입력 이상값** — 중복, 앞뒤 공백, 빈 문자열, 21자 이상, 이모지만. 중복은 "이미 쓰는 활동명이에요", 공백은 잘라 저장, 길이는 1–20자. → Task 6 테스트 `nickname validation`.
3. **문제 있는 맞춤 블록 HTML** — 예외를 던지거나, 무한 반복하거나, `resize(100000)`을 보내거나, `parent`/`localStorage`에 접근하려는 HTML. 사이트는 계속 쓸 수 있고, 높이는 최대 3000px로 자르고, 저장소 접근은 실패해야 한다. → Task 19 테스트 `bridge clamps height`, `bridge ignores messages from other frames`, `bridge denies unlisted permission`.
4. **1MB 넘는 파일 · 이미지가 아닌 파일 · 저장 도중 네트워크 실패** — 친절한 오류, 일부만 저장되는 일 없음(글과 첨부는 한 요청으로 저장). → Task 7 테스트 `post with oversized attachment is rejected atomically`, Task 11 테스트 `image is resized before upload`.
5. **마지막 자리 동시 신청 · 취소 후 대기 확정** — 오프라인 정원 1자리에 두 사람이 동시에 신청하면 한 명은 확정, 한 명은 대기. 확정자가 취소하면 대기 1번만 정확히 한 번 확정되고 알림을 받는다. → Task 9 테스트 `last seat race`, `cancel promotes waitlist once`.

---

## File Structure

```
climate-citizen-platform/
  package.json                 # 루트: 스크립트(test, dev:web, dev:worker, build), devDependencies
  tsconfig.base.json
  vitest.config.ts             # shared + worker 테스트
  shared/src/
    types.ts                   # 도메인 타입 (아래 Task 2)
    date.ts                    # 날짜 계산 · 한국어 표기
    campaignStatus.ts          # 캠페인 상태 · 참가자 단계 · 신청 가능 여부
    missions.ts                # 미션 주기 · 기록 차례 · 진행률 · 미기록 · 지난 기록 채우기
    notificationsDue.ts        # 내 날짜 기준으로 생겨야 할 알림 계산
    calculator/factors.ts      # CONFIG, CARBON_FACTORS (원본 그대로)
    calculator/questions.ts    # QUESTIONS, SECTOR_KEYS, SECTION_NOTES
    calculator/actions.ts      # ACTIONS
    calculator/policies.ts     # POLICIES_REDUCE, POLICIES_SOCIAL, SOCIAL_FOUNDATION
    calculator/calculate.ts    # calculate(), actionPotential()
    validate.ts                # 활동명 · 파일 크기 · 문자열 길이 검사
  shared/test/*.test.ts
  scripts/gen-calc-fixtures.mjs  # 원본 index.html에서 계산 결과 고정값 생성
  worker/
    wrangler.toml
    migrations/0001_init.sql
    src/index.ts               # 라우터, CORS, 공통 미들웨어
    src/auth.ts                # 입장 토큰 HMAC, 헤더 파싱(Ctx)
    src/db.ts                  # D1 래퍼 (Db 인터페이스)
    src/cap.ts                 # 하루 요청 수 집계 · 한도
    src/routes/*.ts            # users, groups, posts, campaigns, participations, records, measurements, tools, admin, notifications, collab, files, sim
    test/helpers/sqliteDb.ts   # better-sqlite3로 Db 인터페이스 구현
    test/*.test.ts
  web/
    index.html  vite.config.ts
    src/main.tsx  src/App.tsx  src/routes.tsx
    src/styles/tokens.css  global.css
    src/lib/api.ts  sim.ts  image.ts  csv.ts  share.ts
    src/components/            # Header, Footer, SimBar, Modal, Sheet, Toast, Button, Chip, Card, Field, EmptyState, Editor, BoardList, PostView, CampaignCard, GroupCard, Progress, BlockFrame
    src/features/home/ calculator/ auth/ onboarding/ me/ about/ groups/ campaigns/ practice/ signature/ offline/ sandbox/ admin/
    src/**/*.test.tsx
  e2e/smoke.spec.ts
  docs/figma/<영역>/<화면코드>.md + .png
  .github/workflows/pages.yml
```

---

### Task 1: 저장소 만들기와 시안 사본 만들기

**Files:**
- Create: `README.md`, `.gitignore`, `docs/figma/index.md`, `docs/figma/<영역>/<코드>.md`, `docs/figma/<영역>/<코드>.png`

**Interfaces:**
- Produces: `docs/figma/` — 이후 모든 화면 작업의 문구 · 배치 기준. 파일 이름은 화면 코드(`H-2.md`, `M-2s.md`, 창은 `modal-글쓰기.md`).

- [ ] **Step 1:** `git init`, 기본 브랜치 `main`. `.gitignore`에 `node_modules`, `dist`, `.wrangler`, `.dev.vars`. 기존 `docs/superpowers/` 두 문서를 첫 커밋에 넣는다.
- [ ] **Step 2:** Figma(fileKey `dWCVFXlr1eOxhfcq3n7gQL`, 페이지 246:2)에서 설계 문서 6장에 나열한 모든 화면 · 창 · 알림 · 기능명세 · Note 노드마다 (a) `use_figma`로 보이는 텍스트를 위→아래, 왼→오른 순서로 뽑고 (b) `get_screenshot`(maxDimension 1600) PNG를 받아 `docs/figma/<영역>/`에 저장한다. 영역 폴더: `home, campaign, practice, signature, offline, groups, calculator, me, onboarding, admin, common`. `docs/figma/index.md`에 노드 ID ↔ 파일 표를 만든다.
- [ ] **Step 3:** 각 `.md` 맨 위에 "화면에 넣지 않는 표기" 목록(주석 칩, 점선 라벨, 화면 코드)을 따로 적어 실행자가 빼게 한다.
- [ ] **Step 4:** 확인 — `ls docs/figma/*/ | wc -l` 결과가 노드 수 × 2와 같다.
- [ ] **Step 5:** `gh repo create minskapo/climate-citizen-platform-sim --public --source . --push`. 커밋 메시지 `docs: add spec, plan, figma snapshots`.

### Task 2: 개발 환경 · shared 날짜 규칙

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `shared/src/types.ts`, `shared/src/date.ts`, `shared/src/validate.ts`
- Test: `shared/test/date.test.ts`, `shared/test/validate.test.ts`

**Interfaces:**
- Produces (`shared/src/types.ts`):
  ```ts
  export type ISODate = string;            // 'YYYY-MM-DD'
  export type HHMM = string;               // 'HH:mm'
  export type Role = 'guest' | 'member' | 'staff' | 'admin';
  export type CampaignType = 'practice' | 'signature' | 'offline';
  export type CampaignStatus = 'draft' | 'scheduled' | 'recruiting' | 'running' | 'closed';
  export type PublishMode = 'now' | 'scheduled' | 'draft';
  export type MissionCycle = 'daily' | 'weekly' | 'whole' | 'dated';
  export type RecordCycle = 'daily' | 'thrice_weekly' | 'weekly' | 'once_end';
  export type RecordField = 'check' | 'memo' | 'photo' | 'number' | 'webtool';
  export type BlockSlot = 'top' | 'after_common' | 'bottom' | 'none';
  export type JoinPolicy = 'open' | 'approval' | 'private';
  export type SignatureJoin = 'ask' | 'auto' | 'none';
  export type AttendanceMode = 'qr' | 'roster' | 'none';
  export type ParticipationState = 'applied' | 'waitlisted' | 'cancelled' | 'paused' | 'quit' | 'signed';
  export interface Schedule {
    recruitStart: ISODate; recruitStartTime?: HHMM; recruitEnd: ISODate; recruitEndTime?: HHMM;
    runStart?: ISODate; runDays?: number;                         // practice
    eventDate?: ISODate; eventStart?: HHMM; eventEnd?: HHMM;     // offline
    deliveryDate?: ISODate;                                       // signature
  }
  ```
- Produces (`shared/src/date.ts`): `addDays(d: ISODate, n: number): ISODate`, `diffDays(from: ISODate, to: ISODate): number`(to−from), `todayReal(): ISODate`(Asia/Seoul), `koShort(d: ISODate): string`(`'2. 8.(월)'`), `koLong(d: ISODate): string`(`'2027. 2. 8.(월)'`), `koRange(a: ISODate, b: ISODate): string`(`'2. 8.–3. 7.'`, 연도가 다르면 앞에 연도), `dDay(today: ISODate, target: ISODate): string`(`'D-12'`, 당일 `'D-day'`).
- Produces (`shared/src/validate.ts`): `normalizeNickname(s: string): { ok: true; value: string } | { ok: false; error: string }`, `MAX_FILE_BYTES = 1_000_000`, `checkFileSize(bytes: number): boolean`.

- [ ] **Step 1:** 루트 `package.json`(workspaces 없이 하나), scripts: `test: vitest run`, `dev:web: vite --config web/vite.config.ts`, `dev:worker: wrangler dev --config worker/wrangler.toml`, `build: vite build --config web/vite.config.ts`. 경로 별칭 `@shared/*` → `shared/src/*`.
- [ ] **Step 2: 실패하는 테스트 작성**
  ```ts
  test('koShort', () => expect(koShort('2027-02-08')).toBe('2. 8.(월)'));
  test('koRange same year', () => expect(koRange('2027-02-08','2027-03-07')).toBe('2. 8.–3. 7.'));
  test('dDay', () => { expect(dDay('2027-01-19','2027-01-31')).toBe('D-12'); expect(dDay('2027-01-31','2027-01-31')).toBe('D-day'); });
  test('addDays across month', () => expect(addDays('2027-02-27', 3)).toBe('2027-03-02'));
  test('nickname validation', () => {
    expect(normalizeNickname('  햇빛부자 ')).toEqual({ ok: true, value: '햇빛부자' });
    expect(normalizeNickname('').ok).toBe(false);
    expect(normalizeNickname('가'.repeat(21)).ok).toBe(false);
    expect(normalizeNickname('🌞🌞').ok).toBe(false);   // 글자(한글·영문·숫자)가 하나도 없으면 거절
  });
  ```
- [ ] **Step 3:** `npx vitest run shared/test` → FAIL(모듈 없음).
- [ ] **Step 4:** 구현. 날짜는 문자열 → UTC 자정 Date로 계산(시간대 혼동 방지).
- [ ] **Step 5:** `npx vitest run shared/test` → PASS. 커밋 `feat(shared): date and validation utilities`.

### Task 3: 캠페인 상태 규칙

**Files:**
- Create: `shared/src/campaignStatus.ts`
- Test: `shared/test/campaignStatus.test.ts`

**Interfaces:**
- Consumes: Task 2 타입, `date.ts`.
- Produces:
  ```ts
  export interface StatusInput { type: CampaignType; publish: PublishMode; showUpcoming: boolean; schedule: Schedule; }
  export function campaignStatus(c: StatusInput, today: ISODate): CampaignStatus;
  export function isVisible(c: StatusInput, today: ISODate): boolean;          // draft는 관리자만; scheduled는 showUpcoming일 때만
  export function canApply(c: StatusInput, today: ISODate, nowTime: HHMM): boolean;
  export function runEnd(c: StatusInput): ISODate | null;                      // practice: runStart+runDays-1, offline: eventDate, signature: recruitEnd
  export type ParticipantPhase = 'before' | 'running' | 'final' | 'after';
  export function participantPhase(c: StatusInput, today: ISODate): ParticipantPhase; // practice: final = runEnd 당일
  export function dayIndex(c: StatusInput, today: ISODate): number | null;    // 진행 n일째(1부터)
  ```
- 규칙(설계 문서 6.3): 실천 — recruitStart 전 scheduled, recruitStart~runStart−1 recruiting(신청은 recruitEnd까지), runStart~runEnd running, 이후 closed. 서명 — recruitStart~recruitEnd recruiting, 이후 closed(running 없음). 오프라인 — recruitStart~eventDate−1 recruiting(신청은 recruitEnd recruitEndTime까지), eventDate running, 이후 closed. `publish==='draft'` → draft.

- [ ] **Step 1: 실패하는 테스트**
  ```ts
  const practice = { type:'practice', publish:'scheduled', showUpcoming:true,
    schedule:{ recruitStart:'2027-01-04', recruitEnd:'2027-01-31', runStart:'2027-02-08', runDays:28 } };
  test('practice timeline', () => {
    expect(campaignStatus(practice,'2027-01-03')).toBe('scheduled');
    expect(campaignStatus(practice,'2027-02-07')).toBe('recruiting');
    expect(canApply(practice,'2027-02-07','10:00')).toBe(false);
    expect(campaignStatus(practice,'2027-03-07')).toBe('running');
    expect(participantPhase(practice,'2027-03-07')).toBe('final');
    expect(dayIndex(practice,'2027-02-20')).toBe(13);
    expect(campaignStatus(practice,'2027-03-08')).toBe('closed');
  });
  test('signature has no running', () => { /* 2027-01-04~2027-02-28: 2-28 recruiting, 3-01 closed */ });
  test('offline event day', () => { /* eventDate 2027-01-25, recruitEnd 2027-01-23 18:00: 1-23 17:59 canApply true, 18:00 false, 1-25 running, 1-26 closed */ });
  test('scheduled hidden unless showUpcoming', () => { /* isVisible false when showUpcoming=false before recruitStart */ });
  ```
- [ ] **Step 2:** 실행 → FAIL. **Step 3:** 구현. **Step 4:** 실행 → PASS. **Step 5:** 커밋 `feat(shared): campaign status rules`.

### Task 4: 미션 · 기록 차례 · 미기록 · 알림 계산

**Files:**
- Create: `shared/src/missions.ts`, `shared/src/notificationsDue.ts`
- Test: `shared/test/missions.test.ts`, `shared/test/notificationsDue.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Mission { id: string; round: number | null; date: ISODate | null; category: string; title: string; description?: string; extraFields: RecordField[]; }
  export function recordSlots(cycle: RecordCycle, runStart: ISODate, runDays: number): ISODate[];
  export function missionForDate(missions: Mission[], cycle: MissionCycle, runStart: ISODate, date: ISODate): Mission | null;
  export function missionLabel(cycle: MissionCycle): '오늘의 미션' | '이번 주 미션' | '이번 미션' | '오늘의 미션';
  export function roundLabel(cycle: MissionCycle, round: number): string;     // 'weekly' → '2주차', 'daily' → '13일째'
  export function progress(slots: ISODate[], recordedDates: ISODate[], today: ISODate): { done: number; total: number; dueSoFar: number; streak: number };
  export function missedStreak(slots: ISODate[], recordedDates: ISODate[], pausedDates: ISODate[], today: ISODate): number; // 오늘 이전의 연속 미기록 차례 수
  export function backfillableSlots(slots: ISODate[], recordedDates: ISODate[], today: ISODate): ISODate[];               // 오늘 이전 최근 2차례 중 미기록
  export function nextSlot(slots: ISODate[], today: ISODate): ISODate | null;
  ```
  기록 차례 규칙 **[이 계획의 결정]**: daily=매일; thrice_weekly=각 7일 묶음의 1·3·5번째 날; weekly=각 7일 묶음의 마지막 날(기간이 7의 배수가 아니면 마지막 날도 포함); once_end=runEnd 하루.
  ```ts
  export type DueKind = 'mission_reminder' | 'missed_1' | 'missed_2' | 'missed_3' | 'offline_day_before' | 'offline_2h' | 'collab_due';
  export interface DueInput { today: ISODate; nowTime: HHMM; reminderTime: HHMM; participations: Array<{ campaignId: string; title: string; slots: ISODate[]; recorded: ISODate[]; paused: ISODate[] }>; offline: Array<{ campaignId: string; title: string; eventDate: ISODate; eventStart: HHMM }>; }
  export function dueNotifications(input: DueInput): Array<{ kind: DueKind; campaignId: string; dedupeKey: string; text: string }>;
  ```
  문구는 「Note: 미기록 알림 규칙」(312:1349) 사본을 따른다. `dedupeKey = kind + campaignId + 날짜`로 같은 알림이 두 번 생기지 않게 한다.

- [ ] **Step 1: 실패하는 테스트**
  ```ts
  test('weekly slots for 28 days', () => expect(recordSlots('weekly','2027-02-08',28)).toEqual(['2027-02-14','2027-02-21','2027-02-28','2027-03-07']));
  test('daily progress', () => expect(progress(recordSlots('daily','2027-02-08',28), dates12, '2027-02-20')).toMatchObject({ done:12, total:28, dueSoFar:13 }));
  test('weekly mission label & round', () => { expect(missionLabel('weekly')).toBe('이번 주 미션'); expect(missionForDate(m4,'weekly','2027-02-08','2027-02-20')?.round).toBe(2); });
  test('missed streak counts slots not days', () => { /* thrice_weekly, 3 slots missed → 3 */ });
  test('paused slots do not count as missed', () => { /* ... */ });
  test('backfill only last 2 slots', () => { /* ... */ });
  test('reminder only after reminderTime and only if unrecorded', () => { /* 19:59 → none, 20:00 → mission_reminder */ });
  test('missed_3 fires once per day', () => { /* same dedupeKey */ });
  ```
- [ ] **Step 2:** FAIL 확인. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** 커밋 `feat(shared): mission schedule and due notifications`.

### Task 5: 1.5도 계산기 이식

**Files:**
- Create: `shared/src/calculator/{factors,questions,actions,policies,calculate}.ts`, `scripts/gen-calc-fixtures.mjs`, `shared/test/fixtures/calc.json`
- Test: `shared/test/calculate.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Answers = Record<string, number | number[] | string[] | Record<string, number> | undefined>;
  export interface CalcResult { sectors: Record<'food'|'consumption'|'transport'|'housing'|'leisure', number>; total: number; gap: number; rate: number; parts: Record<string, number>; raw: { members: number; areaPerPerson: number }; under: boolean; }
  export function calculate(a: Answers): CalcResult;                 // 원본 calculate()와 같은 식, S.answers 대신 인자
  export function actionPotential(actionId: string, r: CalcResult & { ans: Answers }): number;
  export const CONFIG: { TARGET_2030: 5.9; GLOBAL_AVG: 4.6; KOREA_AVG: 13.6; ACTIONS_TO_PICK: 3; SPLIT_HOUSEHOLD_ENERGY: true };
  export const QUESTIONS, SECTOR_KEYS, SECTION_NOTES, ACTIONS, POLICIES_REDUCE, POLICIES_SOCIAL, SOCIAL_FOUNDATION;
  ```
  원본: `/Users/minski/wonju-15c/index.html`(또는 `gh api repos/minskapo/wonju-15c/contents/index.html`) 약 440–830행, `calculate()` 1012행 이후. **계수 · 문항 문구 · 행동 · 정책은 한 글자도 바꾸지 않는다.** 2주 살기 전용(`PRE_QUESTIONS`, `GROUPS`, `BARRIERS`, `baseline`, 일일 기록, 시트 전송)은 옮기지 않는다.

- [ ] **Step 1:** `scripts/gen-calc-fixtures.mjs` — 원본 HTML에서 `<script>` 본문을 꺼내 Node `vm`에서 실행하고, 무작위 응답 30세트 + 경계 응답 5세트(모두 기본값, 가구원 0, 연탄 최대, 태양광 단독주택, 5.9톤 근처)에 대해 원본 `calculate()` 결과와 각 `ACTIONS[].potential`을 `shared/test/fixtures/calc.json`에 쓴다. DOM 의존 코드는 빈 대역 객체로 막는다.
- [ ] **Step 2: 실패하는 테스트**
  ```ts
  test.each(fixtures)('matches original #%#', ({ answers, result, potentials }) => {
    const r = calculate(answers);
    expect(r.total).toBeCloseTo(result.total, 10);
    for (const k of Object.keys(result.sectors)) expect(r.sectors[k]).toBeCloseTo(result.sectors[k], 10);
    for (const [id, v] of Object.entries(potentials)) expect(actionPotential(id, { ...r, ans: answers })).toBeCloseTo(v, 10);
  });
  test('question count', () => expect(SECTOR_KEYS.reduce((s,k)=>s+QUESTIONS[k].length,0)).toBe(28));
  ```
- [ ] **Step 3:** FAIL 확인. **Step 4:** 이식. **Step 5:** PASS. 커밋 `feat(shared): port 1.5C calculator from wonju-15c`.

### Task 6: Worker 뼈대 · DB · 입장 · 사용자

**Files:**
- Create: `worker/wrangler.toml`, `worker/migrations/0001_init.sql`, `worker/src/{index,auth,db,cap}.ts`, `worker/src/routes/{sim,users}.ts`, `worker/test/helpers/sqliteDb.ts`
- Test: `worker/test/auth.test.ts`, `worker/test/users.test.ts`, `worker/test/cap.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Db { all<T>(sql: string, ...p: unknown[]): Promise<T[]>; first<T>(sql: string, ...p: unknown[]): Promise<T | null>; run(sql: string, ...p: unknown[]): Promise<{ changes: number; lastId: number }>; batch(stmts: Array<[string, unknown[]]>): Promise<void>; }
  export interface Ctx { db: Db; userId: string | null; role: Role; simDate: ISODate; simTime: HHMM; staffGroupId: string | null; now: string; }
  export type Handler = (req: Request, ctx: Ctx, params: Record<string, string>) => Promise<Response>;
  export function json(data: unknown, status?: number): Response;
  export function fail(status: number, code: string, message: string): Response;   // body { error: { code, message } }
  export async function issueToken(secret: string, nowMs: number): Promise<string>;  // `${issuedAt}.${hmac}` 30일
  export async function verifyToken(secret: string, token: string, nowMs: number): Promise<boolean>;
  ```
  요청 헤더: `X-Sim-Token`, `X-User-Id`, `X-Role`, `X-Sim-Date`, `X-Sim-Time`, `X-Staff-Group`. 응답 CORS 허용 출처: `https://minskapo.github.io`, `http://localhost:5173`.
  엔드포인트: `POST /api/enter {passcode}` → `{token}` | 401 `BAD_PASSCODE`. `POST /api/users {nickname, sido, sigungu, consents}` → `User` | 409 `NICKNAME_TAKEN`. `GET /api/users?q=` (로그인용 활동명 목록). `GET/PATCH /api/me`.
- 스키마(`0001_init.sql`) — 모든 표에 `id TEXT PRIMARY KEY`(nanoid), `created_at`(실제 시각), 필요한 곳에 `sim_date`. 표: `users, groups, group_members(role: owner|staff|member|pending|banned), invites, posts(board_type: group|campaign, board_id, category, pinned, hidden, attachments_json, sim_date), comments, reactions, reports, campaigns(type, title, summary, image_file_id, host_group_id NULL, schedule_json, settings_json, publish, show_upcoming, hero, status_cache, created_by), missions, mission_bundles, checklist_items, campaign_files, campaign_tools, participations(state, companions, consents_json, answers_json, waitlist_no, shared_by), records(participation_id, slot_date, fields_json), attendance(participation_id, at, method), measurements(user_id NULL, local_id, answers_json, result_json, actions_json, social_json, policies_json, place, campaign_id, kind: start|end|plain, sim_date), tools, tool_versions(html, manifest_json, status: pending|published|archived), tool_records, files(mime, bytes, data BLOB), notifications(user_id, kind, text, link, dedupe_key UNIQUE, read), collab_proposals(due_at), collab_replies, deliveries, delivery_answers, audit_log, request_counts(day PRIMARY KEY, n)`.

- [ ] **Step 1:** `npx wrangler d1 create climate-sim` 실행, 나온 `database_id`를 `wrangler.toml`에 넣는다. `npx wrangler secret put SIM_PASSCODE`(값은 컨트롤러가 전달, `--config worker/wrangler.toml`), `npx wrangler secret put TOKEN_SECRET`(32바이트 무작위).
- [ ] **Step 2: 실패하는 테스트**
  ```ts
  test('enter with wrong passcode → 401', ...);
  test('request without token → 401 NO_TOKEN', ...);
  test('expired token (31 days) → 401', ...);
  test('nickname validation', async () => { /* '  햇빛부자 ' 저장 시 '햇빛부자'; 같은 이름 두 번 → 409 NICKNAME_TAKEN; 빈 문자열 → 400 */ });
  test('daily cap blocks writes over 80000', async () => { /* request_counts 80000 → POST 503 DAILY_CAP, GET 200 */ });
  ```
- [ ] **Step 3:** FAIL 확인. **Step 4:** 구현(`sqliteDb.ts`는 better-sqlite3로 `Db` 구현, 테스트마다 메모리 DB에 마이그레이션 적용). **Step 5:** `npx vitest run worker/test` PASS. `npx wrangler d1 migrations apply climate-sim --remote` 성공. 커밋 `feat(worker): skeleton, passcode, users, daily cap`.

### Task 7: Worker — 모임 · 게시판 · 파일 · 신고

**Files:**
- Create: `worker/src/routes/{groups,posts,files,reports}.ts`
- Test: `worker/test/groups.test.ts`, `worker/test/posts.test.ts`

**Interfaces:**
- Consumes: Task 6 `Ctx`, `Db`, `json`, `fail`.
- Produces(요청/응답은 JSON, 목록은 `{ items, nextCursor }`):
  - `POST /api/groups` · `GET /api/groups?region=&join=&q=&cursor=` · `GET /api/groups/:id`(내 역할 · 단톡방 링크는 멤버에게만) · `PATCH /api/groups/:id`(모임장 · 운영진; 가입 방식 · 단톡방 · 분류) · `POST /api/groups/:id/join`(open→member, approval→pending, private→초대 토큰 필요) · `POST /api/groups/:id/leave` · `POST /api/groups/:id/invites` → `{ url, expiresAt(+7일) }` · `POST /api/groups/:id/members/:uid {action: approve|staff|unstaff|kick|ban}` · `POST /api/groups/:id/transfer {toUserId}`(상대 수락 필요, 7일) · `POST /api/groups/:id/transfer/accept` · `POST /api/groups/:id/close {confirmName}`(모집 중 · 진행 중 주최 캠페인 있으면 409 `HAS_ACTIVE_CAMPAIGN`; 30일 읽기 전용).
  - `GET /api/boards/:type/:id/posts?category=&q=` · `POST /api/boards/:type/:id/posts {category,title,body,attachments:[{name,mime,dataBase64}]}`(공지는 운영진만, 글 · 첨부를 한 `batch`로) · `GET /api/posts/:id` · `PATCH/DELETE /api/posts/:id` · `POST /api/posts/:id/{pin,unpin,hide,unhide,like}` · `POST /api/posts/:id/comments` · `GET /api/popular?days=7&limit=6`(공개 모임 글, 조회+댓글×3 순).
  - `GET /api/files/:id`(바이너리, 캠페인 전용 파일은 참가자 · 관리자만) · `POST /api/reports {targetType,targetId,reason}`.
  - 권한: 운영진 = `group_members.role in (owner, staff)` **또는** `ctx.role==='staff' && ctx.staffGroupId===groupId`(설계 5.3). 모임장 전용(transfer, close)은 실제 owner만.

- [ ] **Step 1: 실패하는 테스트**
  ```ts
  test('approval group: join → pending, staff approves → member', ...);
  test('chat link hidden from non-members', ...);
  test('notice category requires staff', ...);
  test('simulated staff role grants staff rights only for chosen group', ...);
  test('close blocked while hosting recruiting campaign', ...);
  test('post with oversized attachment is rejected atomically', async () => { /* 1.2MB 첨부 → 413 FILE_TOO_LARGE, posts 행 0개 */ });
  test('popular posts exclude private groups', ...);
  ```
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** 커밋 `feat(worker): groups, boards, files, reports`.

### Task 8: Worker — 캠페인 만들기 · 미션 · 체크리스트 · 자료

**Files:**
- Create: `worker/src/routes/campaigns.ts`, `worker/src/campaignSettings.ts`
- Test: `worker/test/campaigns.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // campaignSettings.ts — 유형별 설정 (설계 6.8 / docs/figma/admin/M-2*.md 항목과 1:1)
  export interface CommonSettings { mode: 'online'|'offline'|'hybrid'; hostLink: 'linked'|'none'; slots: Record<'detail'|'before'|'running'|'final'|'signed'|'closed'|'event'|'after', BlockSlot>; blockToolId: string | null; heroEnabled: boolean; }
  export interface PracticeSettings extends CommonSettings { capacity: number | null; reminderTime: HHMM; startPoint: { enabled: boolean; toolId: string }; extraConsents: string[]; recordEnabled: boolean; missionCycle: MissionCycle; recordCycle: RecordCycle; recordFields: RecordField[]; numberUnit?: string; numberGoal?: number; missedAlert: boolean; }
  export interface SignatureSettings extends CommonSettings { demandSummary: string; explainerPostId: string | null; goal: number; countDisplay: 'count_and_rate'|'count'|'hidden'; fields: Array<'nickname'|'region'|'realname'|'opinion'>; hostJoin: SignatureJoin; regionalCounts: boolean; goalAlerts: boolean; deliveryNotice: boolean; }
  export interface OfflineSettings extends CommonSettings { place: { exact: string; public: string }; capacity: number; waitlist: boolean; askCompanions: boolean; askTransport: boolean; customQuestion?: string; photoConsent: boolean; supplies: string; attendance: AttendanceMode; preNotice: boolean; changeNotice: boolean; reviewRequest: boolean; }
  export function validateSettings(type: CampaignType, s: unknown): { ok: true } | { ok: false; field: string; message: string };
  ```
  엔드포인트(관리자만, `ctx.role==='admin'`): `POST /api/campaigns`(초안) · `PUT /api/campaigns/:id`(임시 저장 포함 전체 저장) · `POST /api/campaigns/:id/publish {mode}`(홈 히어로는 한 번에 하나: 새로 걸면 이전 것 해제) · `POST /api/campaigns/:id/clone`(일정 비우고 참가자 · 글 제외) · 미션 `PUT /api/campaigns/:id/missions [Mission]` · 묶음 `GET/POST /api/mission-bundles`, `POST /api/campaigns/:id/missions/from-bundle/:bundleId`(회차 · 날짜를 이 캠페인 일정으로 다시 계산) · 체크리스트 `PUT /api/campaigns/:id/checklist` · 자료 `POST /api/campaigns/:id/files`, `PUT /api/campaigns/:id/tools [{toolId, exclusive}]` · 서명 설명 글은 `posts`(board_type `campaign`, category `explainer`)로 저장.
  공개 조회: `GET /api/campaigns?status=&type=&region=&mode=&q=&sort=deadline` — 상태는 **요청한 사람의 `X-Sim-Date`로 Task 3 `campaignStatus`를 계산해** 돌려준다. `GET /api/campaigns/:id` → `{ campaign, status, phase, counts, myParticipation, checklist(자동 항목 계산 포함), files(전용이면 참가자만), tools, explainer }`.
  자동 체크리스트 항목(설계 6.3): `start_point`(출발점 켬), `reminder`, `greet`, `first_mission`(미션 있음) — 완료 판정은 Task 9의 기록에서 계산.

- [ ] **Step 1: 실패하는 테스트**
  ```ts
  test('non-admin cannot create campaign → 403', ...);
  test('campaign without host group shows host as 녹색전환연구소', ...);
  test('hero is exclusive', ...);
  test('clone clears schedule and participants', ...);
  test('bundle import recomputes rounds for new runDays', ...);
  test('status computed from viewer sim date', async () => { /* 같은 캠페인, X-Sim-Date 1-10 → recruiting, 2-20 → running */ });
  test('settings validation rejects weekly mission with 0 missions when recordEnabled', ...);
  ```
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** 커밋 `feat(worker): campaign authoring`.

### Task 9: Worker — 참여 · 기록 · 출석 · 측정 · 집계

**Files:**
- Create: `worker/src/routes/{participations,records,attendance,measurements,aggregates}.ts`
- Test: `worker/test/participations.test.ts`, `worker/test/records.test.ts`, `worker/test/measurements.test.ts`

**Interfaces:**
- Produces:
  - `POST /api/campaigns/:id/participate {answers, consents, companions?, transport?, startMeasurementId?, sharedBy?, joinHost?}` → `{ participation, waitlisted: boolean }`. 신청 가능 여부는 Task 3 `canApply`(신청자 내 날짜 · 시각). 주최 모임 연결 + 실천 · 오프라인 → 자동 가입, 서명 → `hostJoin` 설정대로. 오프라인 정원은 `companions` 포함 인원으로 계산하고 **한 SQL 문(조건부 INSERT)으로 자리를 잡아** 동시 신청을 막는다.
  - `POST /api/participations/:id/cancel` — 오프라인: 확정자 취소 시 대기 1번을 확정(한 트랜잭션), 알림 생성. 서명: `signed`→`cancelled`(마감 전만).
  - `POST /api/participations/:id/pause`(7일, 기수당 1회) · `POST /api/participations/:id/quit {reason?}`.
  - `PUT /api/participations/:id/records/:slotDate {check: 'done'|'partial'|'none', memo?, photo?: dataBase64, number?, alsoPost?: boolean}` — `slotDate`는 기록 차례(Task 4 `recordSlots`)에 있어야 하고, 오늘(내 날짜) 또는 `backfillableSlots`여야 한다. `alsoPost`면 참가자 게시판에 인증 글 생성.
  - `GET /api/campaigns/:id/today-count?date=` → 그날 기록 수.
  - 출석: `GET /api/campaigns/:id/attendance-code`(관리자 · 운영진, `{ code: 6자리, validUntil }`, 코드 = HMAC(campaignId + 분 단위 시각) 앞 6자리, 지난 1분 코드도 인정) · `POST /api/campaigns/:id/attend {code}`(본인) · `POST /api/participations/:id/attend-manual` / `unattend`(관리자 · 운영진). 출석 창: 모임 시작 −60분 ~ 종료 +60분(내 날짜 · 시각).
  - 측정: `POST /api/measurements {answers, place: 'home'|'menu'|'campaign', campaignId?, kind?, localId?}` → 서버가 Task 5 `calculate`로 결과를 다시 계산해 저장(클라이언트 결과를 믿지 않음). `POST /api/measurements/:id/choices {actions?, social?, policies?}`. `POST /api/measurements/claim {localIds}`(가입 직후 비회원 측정 옮기기). `GET /api/me/measurements`.
  - 집계: `GET /api/aggregates/calculator` → `{ count, avg | null(3명 미만), policyCounts: Record<string, number> }` · `GET /api/aggregates/signature/:id` → `{ count, byRegion: [{name, n}], other: {regions, n} }`(10명 미만 묶음) · `GET /api/aggregates/tool/:toolId/:key`.

- [ ] **Step 1: 실패하는 테스트**
  ```ts
  test('records outside run window are rejected', async () => { /* X-Sim-Date 2027-03-08 기록 → 400 NOT_A_SLOT */ });
  test('backfill limited to last 2 slots', ...);
  test('last seat race', async () => { /* 정원 1, 두 신청 Promise.all → applied 1, waitlisted 1 */ });
  test('cancel promotes waitlist once', async () => { /* 취소 두 번 호출해도 대기 1번만 확정, 알림 1개 */ });
  test('companions count toward capacity', ...);
  test('signature hostJoin=ask joins only when joinHost=true', ...);
  test('server recomputes measurement result', async () => { /* 조작된 total 무시 */ });
  test('regional counts group under 10', ...);
  test('attendance code valid for current and previous minute only', ...);
  ```
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** 커밋 `feat(worker): participation, records, attendance, measurements`.

### Task 10: Worker — 알림 · 협업 제안 · 전달 결과 · 웹 도구 · 관리자 · 체험 데이터

**Files:**
- Create: `worker/src/routes/{notifications,collab,deliveries,tools,admin,simData}.ts`
- Test: `worker/test/notifications.test.ts`, `worker/test/tools.test.ts`, `worker/test/admin.test.ts`

**Interfaces:**
- Produces:
  - 알림: `GET /api/notifications?unread=1` · `POST /api/notifications/read {ids}` · `POST /api/notifications/sync` — 서버가 이 사용자의 참여 · 오프라인 신청을 모아 Task 4 `dueNotifications`(내 날짜 · 시각)로 계산하고 `dedupe_key`로 중복 없이 넣은 뒤 안 읽은 수를 돌려준다. 이벤트 알림(댓글, 운영진 지정, 가입 승인, 대기 확정, 공지, 답장, 목표 달성 50 · 100%, 전달 결과)은 해당 동작의 핸들러가 `notify(db, userId, kind, text, link, dedupeKey)`로 만든다.
  - 공지: `POST /api/campaigns/:id/notices {target: 'all'|'no_start'|'reminder_off'|..., title, body, alsoBoard}`.
  - 협업 제안: `POST /api/collab {title, idea, period, size, groupId?}`(`due_at` = 실제 시각 +24시간) · `GET /api/admin/collab` · `POST /api/admin/collab/:id/reply {body}` · `POST /api/admin/collab/:id/draft` → 제안 내용 · 주최 모임이 채워진 캠페인 초안 id.
  - 전달 결과(서명): `POST /api/campaigns/:id/delivery {summary, photoBase64, councils}` · `POST /api/campaigns/:id/delivery/answers {council, date, body}` · 서명자 모두에게 알림.
  - 웹 도구(관리자): `POST /api/tools {name, slug, kind: 'block'|'page', html, manifest}` → 버전 `pending` · `POST /api/tools/:id/versions` · `POST /api/tools/:id/versions/:v/publish` · `POST /api/tools/:id/rollback {toVersion}` · `GET /api/tools` · `GET /api/tools/:id/published`(공개, 전용이면 참가자만). manifest: `{ permissions: ('user'|'participation'|'record')[], saveKeys: string[], aggregateKeys: Array<{key, op: 'sum'|'avg'|'count'}>, startPoint: boolean }`. 브리지용 `POST /api/tools/:id/records {campaignId?, values}`(manifest `saveKeys` 밖의 키 → 400) · `GET /api/tools/:id/records/mine`. 미리보기 요청은 헤더 `X-Preview: 1`이면 `tool_records`에 `preview=1`로 저장하고 집계에서 뺀다.
  - 관리자: `GET /api/admin/home`(처리할 일 · 현황 · 운영 중 캠페인 · 최근 7일) · `GET /api/admin/campaigns/:id/participants?filter=` · `GET /api/admin/campaigns/:id/export?kind=ops|research`(CSV 텍스트; research는 연구 동의자만, 활동명 대신 일련번호) · `GET /api/admin/reports`, `POST /api/admin/reports/:id {action: hide|dismiss, reason, notify}` · `GET /api/admin/groups|users`, `POST /api/admin/users/:id/restrict`.
  - 체험 데이터: `GET /api/sim/export`(관리자, 전체 JSON) · `POST /api/sim/reset {passcode}`(관리자 + 암호 일치, 모든 표 비우기, `audit_log`에 기록).

- [ ] **Step 1: 실패하는 테스트**
  ```ts
  test('sync creates due notifications once', ...);
  test('collab due_at is +24h', ...);
  test('tool record rejects key outside manifest', ...);
  test('preview records excluded from aggregates', ...);
  test('rollback republishes old version', ...);
  test('research export only includes consented and hides nickname', ...);
  test('reset requires passcode', ...);
  ```
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** `npx wrangler deploy --config worker/wrangler.toml` 후 `curl -s -X POST https://<worker>.workers.dev/api/enter -d "{\"passcode\":\"$SIM_PASSCODE\"}"`가 토큰을 돌려주는지 확인. 커밋 `feat(worker): notifications, collab, delivery, tools, admin, sim data`.

### Task 11: 화면 뼈대 — 디자인 토큰 · 공통 부품 · 입장 · 체험 도구 막대 · 배포

**Files:**
- Create: `web/index.html`, `web/vite.config.ts`, `web/src/{main,App,routes}.tsx`, `web/src/styles/{tokens,global}.css`, `web/src/lib/{api,sim,image,csv,share}.ts`, `web/src/components/*`, `web/src/features/auth/EnterGate.tsx`, `.github/workflows/pages.yml`
- Test: `web/src/lib/sim.test.ts`, `web/src/lib/image.test.ts`, `web/src/components/SimBar.test.tsx`

**Interfaces:**
- Consumes: Worker API(Task 6–10), shared 전부.
- Produces:
  ```ts
  // lib/sim.ts — 브라우저별 체험 상태 (localStorage 키 'sim.v1')
  export interface SimState { token: string | null; userId: string | null; nickname: string | null; role: Role; staffGroupId: string | null; dateOffsetDays: number; fixedDate: ISODate | null; timeOverride: HHMM | null; pendingMeasurementIds: string[]; }
  export function useSim(): SimState & { setRole(r: Role): void; setDate(d: ISODate | null): void; shiftDays(n: number): void; setTime(t: HHMM | null): void; today: ISODate; nowTime: HHMM; signOut(): void };
  // lib/api.ts
  export function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;  // 헤더 자동, 401이면 입장 화면으로, 503 DAILY_CAP이면 토스트
  // lib/image.ts
  export async function shrinkImage(file: File): Promise<{ dataBase64: string; bytes: number; mime: 'image/jpeg' }>; // 긴 변 1280, 품질 0.75, 1MB 넘으면 품질 0.6 재시도 후 실패
  // components
  export function useToast(): (text: string) => void;       // 1.6초
  export function Modal(props: { open: boolean; onClose(): void; title: string; children; danger?: boolean }): JSX.Element; // ≤767px에서는 아래 시트
  ```
  토큰(`tokens.css`): 시안 컴포넌트(246:3)와 화면 사본에서 색 · 반경 · 간격을 뽑는다. 확인된 값: 진한 글자 `#1A1F1C`, 보조 글자 `#6B736E`, 초록 `#1F854F`, 연한 초록 `#E6F5EB`, 배경 `#F5F9F7`, 선 `#DEE3E0`, 카드 반경 16, 칩 반경 999/6.
  체험 도구 막대(`SimBar`): 역할 선택(비회원 · 회원 · 모임 운영진(모임 고르기 창) · 관리자), 활동명 바꾸기(활동명 고르기 창), 내 날짜(날짜 입력 · −1 · +1 · +7 · 오늘로), 시각 바꾸기, 관리자일 때 「체험 데이터 내보내기 · 초기화」. 모바일에서는 접힘.
  헤더: 설계 6.1, 「1.5도 계산기」 버튼은 `/#/calculator`. 회원이면 「알림 n」(60초 sync, `document.visibilityState==='visible'`일 때만).
  배포: GitHub Actions — `npm ci && npm test && npm run build`(`VITE_API_BASE` = Worker 주소, 저장소 변수), `web/dist`를 Pages에 올림. Vite `base: '/climate-citizen-platform-sim/'`.

- [ ] **Step 1: 실패하는 테스트**
  ```ts
  test('today follows fixedDate then offset', () => { /* fixedDate 2027-02-08 + shiftDays(12) → today 2027-02-20 */ });
  test('role persists per browser', ...);
  test('image is resized before upload', async () => { /* 4000x3000 → 긴 변 1280, bytes ≤ 1_000_000 */ });
  test('SimBar hides reset unless admin', ...);
  ```
- [ ] **Step 2:** FAIL. **Step 3:** 구현 + 입장 화면(암호 입력 → `/api/enter`). **Step 4:** `npm test` PASS, `npm run build` 성공. **Step 5:** 저장소 Settings → Pages(Source: GitHub Actions) 설정, push → `https://minskapo.github.io/climate-citizen-platform-sim/`에서 입장 화면이 열린다. 커밋 `feat(web): shell, tokens, sim bar, pages deploy`.

### Task 12: 1.5도 계산기 화면

**Files:**
- Create: `web/src/features/calculator/{CalculatorPage,QuestionView,ResultView,ActionsPicker,SocialFoundation,PolicyPicker,BudgetLine,HomeCalcCard,useCalcDraft}.tsx`
- Test: `web/src/features/calculator/calculator.test.tsx`

**Interfaces:**
- Consumes: Task 5 전부, `POST /api/measurements`, `/choices`, `/claim`, `GET /api/aggregates/calculator`.
- Produces: 라우트 `/#/calculator?from=home|menu|campaign&campaignId=&kind=start|end&q1=<값>&back=<경로>`; `HomeCalcCard`(첫 문항 = `QUESTIONS.food[0]`, 숫자 입력 + 「다음」 → `q1`과 함께 계산기로); `useCalcDraft()`(비회원 측정 id를 `SimState.pendingMeasurementIds`에 보관).
- 화면: 사본 `docs/figma/calculator/D-1p.md`, `onboarding/K-1.md`, `K-2.md`, `K-2b.md`. 분야 소개 → 문항(유형별 입력: num/one/yesno/count/multi, 원본 `h` 안내 · `SECTION_NOTES`) → 결과(설계 6.5: 총량, 평균 · 목표 · 한국 평균, 분야별, 탄소 예산선) → 5.9톤 초과: 감축 행동(최대 3) → 정책(`POLICIES_REDUCE`, 여러 개) / 이하: 사회적 기초 → 정책(`POLICIES_SOCIAL`). 비회원 결과 화면에는 K-2의 가입 권유 카드. 캠페인에서 왔으면 K-2b 띠와 「← ○○로 돌아가기」.

- [ ] **Step 1: 실패하는 테스트**
  ```ts
  test('q1 from home card is prefilled and starts at question 2', ...);
  test('over 5.9 shows actions then reduce policies; max 3 actions', ...);
  test('under 5.9 shows social foundation then social policies', ...);
  test('guest result stored locally and claimed after signup', ...);
  test('campaign flow saves kind=end and shows back link', ...);
  ```
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** 커밋 `feat(web): calculator`.

### Task 13: 가입 · 로그인 · 온보딩 · 공통 신청 창

**Files:**
- Create: `web/src/features/auth/{SignupPage,LoginPicker}.tsx`, `web/src/features/onboarding/{K4Region,K5Campaigns,K6Groups,K7Done}.tsx`, `web/src/features/campaigns/ApplySheet.tsx`
- Test: `web/src/features/onboarding/onboarding.test.tsx`, `web/src/features/campaigns/ApplySheet.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function ApplySheet(props: { campaignId: string; origin: 'detail' | 'elsewhere'; onDone(result: { participationId: string; waitlisted: boolean }): void; onClose(): void }): JSX.Element;
  ```
  유형별 내용: 실천(H-1: 출발점 · 미션 알림 · 동의), 서명(S-1: 요구안 요약 · 설명 글 링크 · 받는 정보 · 전달 동의 · 주최 모임 가입(설정대로)), 오프라인(O-1: 동반 인원 · 이동 수단 · 주최 모임 가입 · 사진 동의 · 대기 안내). `origin==='detail'`이면 완료 후 완료 화면 라우트로, `'elsewhere'`면 닫고 토스트(설계 6.3 공통 신청 창 규칙).
- 가입(I): 시안 모양, 간편 가입 버튼도 같은 폼으로. 로그인: 활동명 검색 · 고르기. 온보딩: 첫 가입 직후 한 번, 단계마다 건너뛰기, K-5 추천(설계 6.7) — 신청 버튼은 `ApplySheet origin='elsewhere'`.

- [ ] **Step 1: 실패하는 테스트**
  ```ts
  test('signup with taken nickname shows 이미 쓰는 활동명이에요', ...);
  test('K-5 sign keeps user on K-5 and shows toast', ...);   // 서명 후 S-2로 이동하지 않음
  test('K-5 shows empty message when no open campaigns', ...);
  test('ApplySheet from detail navigates to completion route', ...);
  test('offline ApplySheet shows waitlist when full', ...);
  ```
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** 커밋 `feat(web): signup, onboarding, apply sheet`.

### Task 14: 홈 · 소개 · 내 활동 · 계정 설정 · 알림함

**Files:**
- Create: `web/src/features/home/{HomePage,Hero,PopularPosts,CampaignSection,GroupSection,StickyCalcBar}.tsx`, `web/src/features/about/AboutPage.tsx`, `web/src/features/me/{MePage,AccountSettings,MyCarbonRecords}.tsx`, `web/src/components/NotificationsPanel.tsx`
- Test: `web/src/features/home/home.test.tsx`, `web/src/features/me/me.test.tsx`

**Interfaces:**
- Consumes: `GET /api/campaigns`, `/api/popular`, `/api/groups`, `/api/aggregates/calculator`, `/api/me/measurements`, 알림 API.
- 화면: 사본 `home/A.md, A-1.md, A-2.md`, `me/E.md, F.md`. 비로그인 히어로 = 홈 히어로로 걸린 캠페인(없으면 플랫폼 소개), 오른쪽 계산기 카드. 로그인 히어로 = 참여 중 캠페인의 지금 미션 + 바로 기록(Task 15 `RecordForm` 재사용) + 나의 탄소 기록. 스크롤 시 고정 헤더 · 계산 전 비회원 하단 바(닫기 기억). 내 활동: 설계 6.6. 계정 설정: 활동명(중복 검사) · 지역 · 연구 활용 동의 · 미션 알림 시각 · 새 글 알림. 소개: 시안 문구 그대로.

- [ ] **Step 1: 실패하는 테스트**
  ```ts
  test('guest hero shows hero campaign or intro when none', ...);
  test('calculator average hidden under 3 measurements', ...);
  test('logged-in hero shows weekly mission label for weekly cycle', ...);
  test('sticky calc bar hidden after measuring', ...);
  test('my carbon records list chosen actions and policies', ...);
  ```
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** 커밋 `feat(web): home, about, me, notifications`.

### Task 15: 캠페인 목록 · 실천 캠페인(H ~ H-4)

**Files:**
- Create: `web/src/features/campaigns/{CampaignListPage,CampaignCard,CampaignHeader,InfoCard,MaterialsList,HostCard,ParticipantBoard,BlockSlotView}.tsx`, `web/src/features/practice/{PracticeDetail,BeforeStart,Running,RecordForm,RecordCalendar,ComebackBanner,PauseQuitModal,FinalView,ReviewForm}.tsx`
- Test: `web/src/features/practice/practice.test.tsx`, `web/src/features/campaigns/list.test.tsx`

**Interfaces:**
- Consumes: Task 3, 4, Task 8 · 9 API, `ApplySheet`, `BlockFrame`(Task 19 — 이 작업에서는 `BlockSlotView`가 `blockToolId`가 있으면 Task 19의 `BlockFrame`을, 없으면 아무것도 그리지 않음. Task 19 전에는 빈 자리 표시만).
- Produces:
  ```ts
  export function RecordForm(props: { participationId: string; slotDate: ISODate; fields: RecordField[]; numberUnit?: string; compact?: boolean; onSaved(): void }): JSX.Element;
  export function BlockSlotView(props: { campaignId: string; screen: 'detail'|'before'|'running'|'final'|'signed'|'closed'|'event'|'after'; slot: BlockSlot }): JSX.Element | null;
  ```
- 라우트: `/#/campaigns`, `/#/campaigns/:id`(유형 · 참여 단계에 따라 상세/시작 전/진행/마무리/서명/오프라인 화면 선택), 탭 `?tab=today|records|board|info`.
- 화면: 사본 `campaign/B.md`, `practice/H*.md`, 메모 `Note-상태별-주-버튼.md`, `Note-미기록-알림-규칙.md`. 상태별 주 버튼 · 인원 표시(Note) — 모집 예정은 「알림 받기」(알림 구독 저장). 진행 중 화면에서 기록 차례가 아닌 날은 「다음 기록일 ○. ○.(요일)」. 다시 시작 배너는 `missedStreak ≥ 3`. 쉬어 가기 · 그만두기(H-3b). 마무리: 출발점 도구로 다시 재기(→ 계산기 `kind=end`), 출발점 · 마무리 비교, 분류별 기록률, 후기(주최 모임 「후기」 또는 캠페인 게시판), 완주 기록, 내 기록 CSV. 맞춤 블록은 설정된 위치(`BlockSlot`)에 놓는다: `top` = 머리(상태 배너) 아래, `after_common` = 공통 카드 다음, `bottom` = 자료 · 게시판 위.

- [ ] **Step 1: 실패하는 테스트**
  ```ts
  test('status differs per viewer date', ...);             // 같은 데이터, 내 날짜만 바꿔 렌더 → 모집 중 / 진행 중
  test('weekly cycle shows 이번 주 미션 and next record date on off days', ...);
  test('comeback banner after 3 missed slots', ...);
  test('final view on last day offers re-measure', ...);
  test('block placed at configured slot only', ...);
  test('list filters by type and status chips', ...);
  ```
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** 커밋 `feat(web): campaign list and practice campaign`.

### Task 16: 서명 캠페인(S ~ S-3)

**Files:**
- Create: `web/src/features/signature/{SignatureDetail,ExplainerArticle,RegionalCounts,SignedView,ClosedView,CancelSignModal}.tsx`
- Test: `web/src/features/signature/signature.test.tsx`

**Interfaces:**
- Consumes: Task 15 공통 부품, `ApplySheet`, `/api/aggregates/signature/:id`, 전달 결과 API, `lib/share.ts`(`buildShareUrl(campaignId, userId)`; `?ref=`로 `sharedBy`).
- 화면: 사본 `signature/S*.md`, 메모 `기능명세-서명.md`. 요구안 요약 + 설명 글(게시물 본문 · 이미지), 오른쪽 서명 수 · 목표 달성률 막대 · 「서명하기」 · 지역별 서명 수, 서명 완료(n번째, 이어서 해 보세요, 서명 취소 확인 창), 마감 · 전달 결과(사진 · 본문 · 답변 목록, 아직 답 없는 곳 수). `countDisplay`가 `hidden`이면 숫자 대신 "서명이 모이고 있어요".

- [ ] **Step 1: 실패하는 테스트**
  ```ts
  test('signed view shows ordinal of my signature', ...);
  test('share link credits referrer', ...);
  test('cancel only before close', ...);
  test('closed view lists delivery answers and pending count', ...);
  ```
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** 커밋 `feat(web): signature campaign`.

### Task 17: 오프라인 모임 캠페인(O ~ O-4)

**Files:**
- Create: `web/src/features/offline/{OfflineDetail,BeforeEvent,EventDay,AttendSheet,AfterEvent,Certificate}.tsx`
- Test: `web/src/features/offline/offline.test.tsx`

**Interfaces:**
- Consumes: Task 15 공통 부품, 출석 API(Task 9).
- 화면: 사본 `offline/O*.md`, 메모 `기능명세-오프라인.md`. 정확한 주소는 신청자에게만. 당일 「QR 찍고 출석하기」 → 6자리 코드 입력 창(휴대폰으로 QR을 찍으면 `/#/attend/:campaignId?code=` 주소가 열려 자동 입력) → 출석 완료 창. 출석 창 밖이면 "출석은 ○○:○○부터 열려요". 끝난 뒤: 사진 올리기(참가자 게시판 「후기」 글), 후기, 같은 주최 모임의 모집 중 캠페인, 참여 확인서(인쇄용 화면 `window.print`).

- [ ] **Step 1: 실패하는 테스트**
  ```ts
  test('exact address hidden before applying', ...);
  test('attend link with code auto-submits', ...);
  test('attendance closed outside window shows opening time', ...);
  test('after view suggests host group recruiting campaigns', ...);
  ```
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** 커밋 `feat(web): offline campaign`.

### Task 18: 모임(C · G · G-1 · G-2 · J) · 게시판 · 협업 제안

**Files:**
- Create: `web/src/features/groups/{GroupListPage,GroupCard,GroupDetail,GroupManage,NewGroupPage,InviteAccept,StaffNotices}.tsx`, `web/src/components/{BoardList,PostView,Editor,CommentList}.tsx`, `web/src/features/collab/CollabModal.tsx`
- Test: `web/src/features/groups/groups.test.tsx`, `web/src/components/Editor.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function Editor(props: { initial?: { title: string; body: string; attachments: Attachment[] }; categories: string[]; allowNotice: boolean; onSubmit(v: { category: string; title: string; body: string; attachments: NewAttachment[] }): Promise<void> }): JSX.Element; // 본문 단락 · 이미지 · 링크 · 첨부. 서명 설명 글 편집에도 재사용
  export function CollabModal(props: { groupId?: string; onClose(): void }): JSX.Element;
  ```
- 화면: 사본 `groups/*.md` 및 창 · 알림. 설계 6.4 전부. 협업 제안 창은 홈 · 캠페인 목록 · 새 모임 만들기 · 운영진 화면에서 연다(「1일 안에 답변드려요」).

- [ ] **Step 1: 실패하는 테스트**
  ```ts
  test('private group visible by name only; invite link joins', ...);
  test('staff manage page hidden from members', ...);
  test('transfer requires acceptance within 7 days', ...);
  test('close requires exact group name', ...);
  test('editor rejects 1.2MB attachment with friendly error', ...);
  ```
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** 커밋 `feat(web): groups and boards`.

### Task 19: 맞춤 블록 · 웹 도구 샌드박스

**Files:**
- Create: `web/src/features/sandbox/{BlockFrame,PageToolView,bridge,template}.ts(x)`, `web/public/tool-template.html`
- Test: `web/src/features/sandbox/bridge.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function BlockFrame(props: { toolId: string; campaignId?: string; preview?: boolean }): JSX.Element;   // iframe sandbox="allow-scripts", srcdoc = 게시 버전 html + 브리지 클라이언트 주입
  export function PageToolView(): JSX.Element;                                                                 // 라우트 /#/tools/:slug, 상단바 아래 전체 화면
  export function createBridgeHost(opts: { iframe: HTMLIFrameElement; tool: { id: string; manifest: Manifest }; campaignId?: string; preview: boolean; onResize(h: number): void; onToast(t: string): void }): () => void; // 해제 함수 반환
  ```
  메시지 형식: `{ __bridge: 1, id, method, args }` → `{ __bridge: 1, id, ok, result | error }`. 메서드는 설계 6.11 목록뿐. `event.source !== iframe.contentWindow`인 메시지는 무시. `resize`는 0–3000px로 자름. manifest 권한 밖 메서드는 `PERMISSION_DENIED`. 시작 템플릿(`tool-template.html`)에는 브리지 클라이언트(`window.platform.getUser()` 등 Promise 래퍼)와 예제가 들어 있다.

- [ ] **Step 1: 실패하는 테스트**
  ```ts
  test('bridge clamps height', ...);                      // resize(100000) → onResize(3000)
  test('bridge ignores messages from other frames', ...);
  test('bridge denies unlisted permission', ...);         // manifest에 record 없음 → saveRecord 거절
  test('preview saves with X-Preview header', ...);
  ```
- [ ] **Step 2:** FAIL. **Step 3:** 구현. Task 15의 `BlockSlotView`가 `BlockFrame`을 쓰도록 연결. **Step 4:** PASS. 수동 확인: `throw`하는 HTML, `while(true){}` HTML을 올려도 페이지의 다른 부분이 반응한다(무한 반복 블록은 iframe만 멈춤). **Step 5:** 커밋 `feat(web): sandboxed blocks and page tools`.

### Task 20: 관리자 — 로그인 · 홈 · 캠페인 목록 · 캠페인 만들기(실천 · 서명 · 오프라인)

**Files:**
- Create: `web/src/features/admin/{AdminLayout,AdminLogin,AdminHome,CampaignAdminList}.tsx`, `web/src/features/admin/editor/{CampaignEditor,BasicSection,ScheduleSection,PracticeSections,SignatureSections,OfflineSections,BlockAndMaterials,PublishSection,SidePreview}.tsx`, `web/src/features/admin/modals/{Clone,HostGroup,StartTool,MissionEdit,BundleImport,ChecklistItem,BlockPick,WebToolLink,PublishConfirm}.tsx`
- Test: `web/src/features/admin/editor/editor.test.tsx`

**Interfaces:**
- Consumes: Task 8 `campaignSettings` 타입 · `validateSettings`, Task 3 상태(옆 패널 상태 사슬), Task 18 `Editor`(서명 설명 글).
- 화면: 사본 `admin/M-0, M, M-1, M-2, M-2s, M-2o`와 창. 유형 칩을 바꾸면 같은 편집 화면에서 유형별 섹션이 바뀐다(입력값은 공통 섹션만 유지). 「사용자 화면 미리보기」 = 새 탭으로 캠페인 상세(초안도 관리자에게 보임). 「참가자에게는 이렇게 보여요」 요약 문장은 미션 주기 · 기록 주기 · 기간에서 계산(예: "미션은 매주 월요일에 바뀌고, 매일 그 주 미션을 실천했는지 체크해요 · 4주 동안 미션 4개, 기록 28번" — 요일은 `runStart`의 요일).

- [ ] **Step 1: 실패하는 테스트**
  ```ts
  test('switching type keeps common fields and swaps sections', ...);
  test('summary sentence reflects cycles and duration', ...);
  test('host link none hides host group picker and signature join option', ...);
  test('block placement per screen saved', ...);
  test('publish scheduled shows confirm with schedule', ...);
  ```
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** 커밋 `feat(web): admin campaign authoring`.

### Task 21: 관리자 — 참가자 관리 · 웹 도구 · 신고와 협업 제안 · 기타 메뉴

**Files:**
- Create: `web/src/features/admin/{ParticipantsPractice,SignersPage,OfflineRoster,AttendanceQrModal,DeliveryListPrint,NoticeModal,ExportModal,WebTools,WebToolPreview,UploadToolModal,ReportsCollab,GroupsTable,UsersTable,DataStats,DeliveryResultForm}.tsx`
- Test: `web/src/features/admin/admin.test.tsx`

**Interfaces:**
- Consumes: Task 9 · 10 API, Task 19 `BlockFrame`(미리보기 `preview`), `lib/csv.ts`(`toCsv(rows: string[][]): string`, BOM 포함).
- 화면: 사본 `admin/M-1a, M-1s, M-1o, M-3, M-3a, M-4`와 창. 출석 QR 창은 6자리 코드 + `qrcode`로 만든 QR(`/#/attend/:id?code=`), 1분마다 갱신. 전달용 명단은 의회별 인쇄용 화면. 웹 도구 올리기 = HTML 파일 1개 + 설명 입력란(이름 · 주소 · 규격 · 권한 · 저장 값 · 집계 값 · 출발점 가능). 「시작 템플릿 내려받기」 = `tool-template.html`. 기타 메뉴는 간단한 표(설계 6.8).

- [ ] **Step 1: 실패하는 테스트**
  ```ts
  test('roster manual check toggles attendance', ...);
  test('qr modal refreshes code every minute', ...);
  test('upload rejects html over 1MB', ...);
  test('reports hide notifies author when chosen', ...);
  test('collab shows due label 오늘까지/내일까지 by real time', ...);
  ```
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** 커밋 `feat(web): admin participants, tools, reports`.

### Task 22: 반응형 마무리 · 전체 흐름 점검 · 공개

**Files:**
- Create: `e2e/smoke.spec.ts`, `playwright.config.ts`
- Modify: 반응형이 깨지는 화면들

**Interfaces:**
- Consumes: 전체.

- [ ] **Step 1: 흐름 테스트 작성**(Playwright, 데스크탑 1440 + 모바일 390 두 크기) — 하나의 테스트 안에서 브라우저 컨텍스트 2개(A, B)를 써서:
  1. A: 입장 → 가입 → 관리자로 전환 → 주최 모임 없이 실천 캠페인(주마다 미션 4개, 매일 기록) 만들어 바로 공개.
  2. B: 입장 → 계산기 28문항 → 결과 → 가입 → 온보딩 K-5에서 그 캠페인 신청 → K-5에 머무름.
  3. B: 내 날짜를 진행 13일째로 → 「이번 주 미션」 기록 → 참가자 게시판 인증.
  4. A(내 날짜 그대로): 캠페인이 「모집 중」으로 보이고, 게시판에 B의 글이 보임.
  5. A: 서명 캠페인 · 오프라인 캠페인(정원 1) 만들기 → B 서명 · 신청 → A 운영 화면에서 서명자 1 · 신청 1 확인.
  6. 모바일 크기에서 같은 단계 1–3이 가로 스크롤 없이 진행됨(`document.documentElement.scrollWidth <= innerWidth`).
- [ ] **Step 2:** `npx playwright test` — 배포된 Worker를 쓰되 시작 전 `POST /api/sim/reset`. 실패하면 고치고 다시 실행해 PASS.
- [ ] **Step 3:** 화면마다 `docs/figma` 사본 스크린샷과 나란히 비교해 문구 · 배치가 맞는지, 개발용 표기가 없는지 확인(체크리스트를 `docs/qa.md`에 기록).
- [ ] **Step 4:** `POST /api/sim/reset`으로 데이터 비우기. README에 접속 주소 · 입장 암호 · 체험 방법(역할 전환 · 내 날짜)을 적는다.
- [ ] **Step 5:** 커밋 `test: end-to-end smoke and responsive fixes`, push → Pages 배포 확인.
