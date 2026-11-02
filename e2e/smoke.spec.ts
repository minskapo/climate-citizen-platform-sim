import { expect, test, type Browser, type Page } from '@playwright/test';
import { checkScreen, enter, expectNoHorizontalScroll, isMobile, runCalculator, seoulDate, setRole, setSimDate, signup } from './helpers';

const RUN = Date.now().toString(36).slice(-5);

async function newPage(browser: Browser, viewport: { width: number; height: number } | null): Promise<Page> {
  const ctx = await browser.newContext({ viewport: viewport ?? undefined, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  return ctx.newPage();
}

test('관리자 · 회원 두 사람이 캠페인 하나를 끝까지 쓴다', async ({ browser }, info) => {
  const viewport = info.project.use.viewport ?? null;
  const tag = `${info.project.name === 'mobile' ? 'm' : 'd'}${RUN}`;
  const A = await newPage(browser, viewport);
  const B = await newPage(browser, viewport);
  const mobile = isMobile(A);
  const practiceTitle = `한달 실천 ${tag}`;

  // 1. A: 입장 → 가입 → 관리자 → 실천 캠페인 바로 공개
  await enter(A);
  await A.goto('./#/signup');
  await signup(A, `관리자${tag}`);
  await checkScreen(A, 'K-4');
  if (mobile) await expectNoHorizontalScroll(A, 'K-4');
  await setRole(A, '관리자');
  await expect(A).toHaveURL(/#\/admin/);
  await A.goto('./#/admin/campaigns/new?type=practice');
  await checkScreen(A, 'M-2', { admin: true });
  await A.getByLabel('캠페인 이름').fill(practiceTitle);
  await A.getByLabel('설명').fill('4주 동안 매주 바뀌는 미션을 매일 기록해요.');
  await A.getByLabel('모집 시작 날짜').fill(seoulDate(0));
  await A.getByLabel('모집 시작 시각').fill('00:00');
  await A.getByLabel('모집 마감 날짜').fill(seoulDate(6));
  await A.getByLabel('모집 마감 시각').fill('23:59');
  await A.getByLabel('진행 시작 날짜').fill(seoulDate(7));
  await A.getByLabel('진행 기간').fill('28');
  await A.getByRole('group', { name: '미션 주기' }).getByRole('button', { name: '주마다 바뀜' }).click();
  await A.getByRole('group', { name: '기록 주기' }).getByRole('button', { name: '매일' }).click();
  for (const m of ['계단 이용하기', '채식 한 끼', '대기전력 끄기', '장바구니 챙기기']) {
    await A.getByRole('button', { name: /\+ 미션 추가/ }).click();
    const dlg = A.getByRole('dialog', { name: '미션 추가 · 수정' });
    await dlg.getByPlaceholder('예: 엘리베이터 대신 계단 이용하기').fill(m);
    await dlg.getByRole('button', { name: '추가' }).click();
    await expect(dlg).toBeHidden();
  }
  await expect(A.getByText('미션 목록 · 주마다 바뀜 (4개)')).toBeVisible();
  await A.getByRole('group', { name: '공개 방식' }).getByRole('button', { name: '바로 공개' }).click();
  await A.getByRole('button', { name: '바로 공개하기' }).click();
  await expect(A).toHaveURL(/#\/admin\/campaigns$/);
  await expect(A.getByText(practiceTitle)).toBeVisible();
  await checkScreen(A, 'M-1', { admin: true });

  if (mobile) await expectNoHorizontalScroll(A, '캠페인 만들기');

  // 2. B: 입장 → 계산기 28문항 → 결과 → 가입 → K-5에서 신청 → K-5에 머묾
  await enter(B);
  await B.goto('./#/calculator');
  await checkScreen(B, 'D-1p');
  if (mobile) await expectNoHorizontalScroll(B, '계산기');
  await runCalculator(B);
  await checkScreen(B, 'K-2');
  if (mobile) await expectNoHorizontalScroll(B, '계산 결과');
  await B.getByRole('button', { name: '다른 방법으로 가입하기' }).click();
  await signup(B, `회원${tag}`);
  await B.getByText('온라인에서').click();
  await B.getByRole('button', { name: '다음', exact: true }).click();
  await expect(B).toHaveURL(/#\/onboarding\/campaigns/);
  const item = B.locator('.ob-item', { hasText: practiceTitle });
  await item.getByRole('button', { name: '신청하기' }).click();
  const sheet = B.getByRole('dialog', { name: '참여 신청' });
  await expect(sheet).toBeVisible();
  await checkScreen(B, 'H-1');
  if (mobile) await expectNoHorizontalScroll(B, '신청 창');
  await sheet.getByRole('button', { name: '참여 신청 완료하기' }).click();
  await expect(sheet).toBeHidden();
  await expect(item.getByText('✓ 신청했어요')).toBeVisible();
  await checkScreen(B, 'K-5');
  await expect(B).toHaveURL(/#\/onboarding\/campaigns/);
  if (mobile) await expectNoHorizontalScroll(B, 'K-5');

  // 3. B: 내 날짜를 진행 13일째로 → 「이번 주 미션」 기록 → 참가자 게시판 인증
  const day13 = seoulDate(7 + 12);
  await setSimDate(B, day13);
  await B.goto('./#/campaigns');
  await B.getByRole('link', { name: new RegExp(practiceTitle) }).first().click();
  const mission = B.getByRole('region', { name: '이번 주 미션' });
  await expect(mission.getByRole('heading', { name: '이번 주 미션: 채식 한 끼' })).toBeVisible();
  await expect(mission.getByText(/13일째/)).toBeVisible();
  if (mobile) await expectNoHorizontalScroll(B, '진행 중 13일째');
  await mission.getByRole('radio', { name: '했어요', exact: true }).click();
  await expect(mission.getByLabel('참가자 게시판에도 인증 올리기')).toBeChecked();
  await mission.getByRole('button', { name: '기록 저장' }).click();
  await expect(mission.getByRole('button', { name: '기록 고치기' })).toBeVisible();
  const proof = B.getByRole('region', { name: '참가자 게시판 · 오늘의 인증' });
  await expect(proof.getByText(/채식 한 끼/)).toBeVisible();
  await checkScreen(B, 'H-3');
  const practiceUrl = B.url();
  if (mobile) {
    await expectNoHorizontalScroll(B, '기록 저장 뒤');
    return; // 모바일은 1–3단계만 확인한다.
  }

  // 4. A(내 날짜 그대로): 캠페인이 「모집 중」, 게시판에 B의 글
  await A.goto(practiceUrl.replace(/^.*#/, './#'));
  await expect(A.locator('main').getByText('모집 중').first()).toBeVisible();
  await expect(A.getByRole('region', { name: '참가자 게시판' }).getByText(/채식 한 끼/)).toBeVisible();
  await checkScreen(A, 'H');

  // 5. A: 서명 · 오프라인(정원 1) 캠페인 → B 서명 · 신청 → A 운영 화면 확인
  const sigTitle = `기후예산 서명 ${tag}`;
  const offTitle = `옥상 탐방 ${tag}`;
  await A.goto('./#/admin/campaigns/new?type=signature');
  await A.getByLabel('캠페인 이름').fill(sigTitle);
  await A.getByLabel('설명').fill('우리 동네 기후 예산을 늘려 달라고 요구해요.');
  await A.getByLabel('서명 시작 날짜').fill(seoulDate(0));
  await A.getByLabel('서명 시작 시각').fill('00:00');
  await A.getByLabel('서명 마감 날짜').fill(seoulDate(30));
  await A.getByLabel('서명 마감 시각').fill('23:59');
  await A.getByLabel('요구안 요약').fill('기후 대응 예산을 늘려 주세요.');
  await A.getByRole('group', { name: '공개 방식' }).getByRole('button', { name: '바로 공개' }).click();
  await A.getByRole('button', { name: '바로 공개하기' }).click();
  await expect(A).toHaveURL(/#\/admin\/campaigns$/);

  await A.goto('./#/admin/campaigns/new?type=offline');
  await A.getByLabel('캠페인 이름').fill(offTitle);
  await A.getByLabel('설명').fill('동네 옥상 태양광을 함께 둘러봐요.');
  await A.getByLabel('모집 시작 날짜').fill(seoulDate(0));
  await A.getByLabel('모집 시작 시각').fill('00:00');
  await A.getByLabel('모집 마감 날짜').fill(seoulDate(10));
  await A.getByLabel('모집 마감 시각').fill('23:59');
  await A.getByLabel('모임 날짜 날짜').fill(seoulDate(12));
  await A.getByLabel('시작 시각', { exact: true }).fill('14:00');
  await A.getByLabel('끝나는 시각').fill('16:00');
  await A.getByLabel('정확한 주소').fill('서울 마포구 성산로 1');
  await A.getByLabel('공개용 대략 위치').fill('마포구 성산동');
  await A.getByLabel('정원').fill('1');
  await A.getByRole('group', { name: '공개 방식' }).getByRole('button', { name: '바로 공개' }).click();
  await A.getByRole('button', { name: '바로 공개하기' }).click();
  await expect(A).toHaveURL(/#\/admin\/campaigns$/);

  const idOf = async (title: string) => {
    const href = await A.locator('tr', { hasText: title }).getByRole('link', { name: '참가자' }).getAttribute('href');
    return /campaigns\/([^/]+)\/participants/.exec(href ?? '')![1];
  };
  const sigId = await idOf(sigTitle);
  const offId = await idOf(offTitle);

  await setSimDate(B, seoulDate(0));
  await B.goto(`./#/campaigns/${sigId}`);
  await checkScreen(B, 'S');
  await B.getByRole('button', { name: '서명하기' }).first().click();
  const signDlg = B.getByRole('dialog', { name: '서명하기' });
  await signDlg.getByLabel(/\[필수\] 활동명과 사는 지역을/).check();
  await signDlg.getByRole('button', { name: '서명하기' }).click();
  await expect(signDlg).toBeHidden();
  await expect(B.getByText(/서명했어요!/)).toBeVisible();
  await checkScreen(B, 'S-2');

  await B.goto(`./#/campaigns/${offId}`);
  await checkScreen(B, 'O');
  await B.getByRole('button', { name: /신청하기/ }).first().click();
  const offDlg = B.getByRole('dialog', { name: '참여 신청' });
  await offDlg.getByRole('button', { name: '신청 완료하기' }).click();
  await expect(offDlg).toBeHidden();
  await expect(B.getByRole('heading', { name: /신청이 완료됐어요!/ })).toBeVisible();
  await expect(B.getByRole('heading', { name: '모임 전에 확인해 주세요' })).toBeVisible();
  await checkScreen(B, 'O-2');

  await A.goto(`./#/admin/campaigns/${sigId}/participants`);
  await expect(A.getByRole('listitem').filter({ hasText: '서명' }).first()).toContainText('1명');
  await checkScreen(A, 'M-1s', { admin: true });
  await A.goto(`./#/admin/campaigns/${offId}/participants`);
  await expect(A.getByRole('listitem').filter({ hasText: '인원' }).first()).toContainText('신청 1건');
  await checkScreen(A, 'M-1o', { admin: true });
});

/** 남은 화면 둘러보기: 데이터가 있는 상태에서 화면마다 개발용 표기가 없는지 본다(QA_SHOTS=1이면 스크린샷). */
test('화면 둘러보기 · 개발용 표기 없음', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile' && !process.env.QA_SHOTS, '모바일은 QA_SHOTS=1일 때만');
  await enter(page);
  for (const [path, name] of [['./#/', 'A'], ['./#/campaigns', 'B'], ['./#/groups', 'C'], ['./#/about', 'F'], ['./#/signup', 'I'], ['./#/groups/new', 'J']] as const) {
    await page.goto(path);
    await checkScreen(page, name);
  }
  await page.goto('./#/signup');
  await signup(page, `둘러보기${RUN}${info.project.name[0]}`);
  for (const [path, name] of [['./#/', 'A-2'], ['./#/me', 'E'], ['./#/groups/new', 'J-member']] as const) {
    await page.goto(path);
    await checkScreen(page, name);
  }
  if (info.project.name === 'desktop') {
    // 태블릿 폭(768–899)에서는 머리글이 펼침 메뉴로 접혀 넘치지 않는다.
    await page.setViewportSize({ width: 820, height: 900 });
    await page.goto('./#/campaigns');
    await expect(page.getByRole('button', { name: '메뉴 열기' })).toBeVisible();
    await expectNoHorizontalScroll(page, '태블릿 머리글');
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await setRole(page, '관리자');
  for (const [path, name] of [['./#/admin', 'M'], ['./#/admin/campaigns', 'M-1'], ['./#/admin/tools', 'M-3'], ['./#/admin/reports', 'M-4'], ['./#/admin/campaigns/new?type=signature', 'M-2s'], ['./#/admin/campaigns/new?type=offline', 'M-2o']] as const) {
    await page.goto(path);
    await checkScreen(page, name, { admin: true });
  }
});
