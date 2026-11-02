import { expect, type Page } from '@playwright/test';
import { passcode } from './sim';

/** 서울 기준 오늘 + n일 (YYYY-MM-DD) */
export function seoulDate(plusDays = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + plusDays);
  return d.toISOString().slice(0, 10);
}

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;

/** 가로 스크롤이 생기지 않았는지 */
export async function expectNoHorizontalScroll(page: Page, where: string) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, `가로 스크롤 없음: ${where}`).toBeLessThanOrEqual(iw);
}

export async function enter(page: Page) {
  await page.goto('./');
  await page.getByLabel('입장 암호').fill(passcode());
  await page.getByRole('button', { name: '들어가기' }).click();
  await expect(page.getByRole('region', { name: '체험 도구' })).toBeVisible();
}

/** 모바일에서는 체험 도구 막대를 펼친 뒤 fn을 실행한다. */
async function withSimBar(page: Page, fn: () => Promise<void>) {
  const bar = page.getByRole('region', { name: '체험 도구' });
  const toggle = bar.locator('.simbar-toggle');
  if (await toggle.isVisible()) {
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }
  await fn();
  if (await toggle.isVisible()) {
    if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click();
  }
}

export async function setRole(page: Page, label: '비회원' | '회원' | '관리자') {
  await withSimBar(page, async () => {
    await page.getByRole('region', { name: '체험 도구' }).getByLabel('지금 역할').selectOption({ label });
  });
}

export async function setSimDate(page: Page, iso: string) {
  await withSimBar(page, async () => {
    await page.getByRole('region', { name: '체험 도구' }).getByLabel('내 날짜').fill(iso);
  });
}

export async function signup(page: Page, nickname: string) {
  await page.getByLabel('활동명').fill(nickname);
  await page.getByLabel('전체 동의').check();
  await page.getByRole('button', { name: '가입하기', exact: true }).click();
  await expect(page.getByRole('heading', { name: `반가워요, ${nickname} 님!` })).toBeVisible();
}

/** 1.5도 계산기 28문항을 첫 보기로 답하고 결과까지 간다. */
export async function runCalculator(page: Page) {
  const card = page.locator('.calc-card').first();
  for (let i = 0; i < 80; i++) {
    if (await page.getByRole('region', { name: '계산 결과' }).isVisible()) return;
    const group = card.getByRole('radiogroup');
    if ((await group.count()) > 0 && (await group.first().locator('[aria-checked="true"]').count()) === 0) {
      await group.first().getByRole('radio').first().click();
    }
    const next = card.getByRole('button', { name: /^(시작하기|다음|결과 보기)$/ });
    const last = (await next.textContent())?.trim() === '결과 보기';
    await next.click();
    if (last) break;
  }
  await expect(page.getByRole('region', { name: '계산 결과' })).toBeVisible();
}

const DEV_PHRASES = /플랫폼 공통 항목|캠페인 설정에 따라 자동 구성|캠페인별 맞춤 영역|블록형 샌드박스|위치 [①②③④]/;
/** 화면 코드(H-2, D-1p, M-1a …). 「D-12」 같은 마감 표시는 화면 코드가 아니라 D는 뺀다. */
const SCREEN_CODE = /(?<![\w가-힣])(?:[A-CE-KMOS]-\d{1,2}[a-z]?|D-1p)(?![\w])/;

/**
 * 사용자 화면 점검: 개발용 표기(주석 칩 · 점선 라벨 · 화면 코드)가 없는지 확인하고,
 * QA_SHOTS=1이면 test-results/qa/에 전체 화면을 저장한다(docs/figma 사본과 나란히 비교용).
 */
export async function checkScreen(page: Page, name: string, opts: { admin?: boolean } = {}) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  // 기다린 뒤에도 불러오는 중 표시가 남아 있으면 화면 점검 실패(조용히 넘어가지 않음).
  await expect(page.locator('main .spinner'), `불러오기 끝남: ${name}`).toHaveCount(0, { timeout: 15_000 });
  const text = await page.locator('body').innerText();
  const main = text.replace(/^[\s\S]*?체험 도구[\s\S]*?(?=기후시민플랫폼)/, '');
  if (!opts.admin) expect(main, `개발용 문구 없음: ${name}`).not.toMatch(DEV_PHRASES);
  expect(main.match(SCREEN_CODE)?.[0] ?? null, `화면 코드 없음: ${name}`).toBeNull();
  if (process.env.QA_SHOTS) {
    const w = page.viewportSize()?.width ?? 0;
    await page.screenshot({ path: `test-results/qa/${w}-${name}.png`, fullPage: true });
  }
}
