import { defineConfig } from '@playwright/test';

/**
 * 전체 흐름 점검(배포된 Worker 사용). 입장 암호는 환경 변수로만 받는다:
 *   SIM_PASSCODE=… npx playwright test
 * E2E_BASE_URL을 주지 않으면 로컬 `vite preview`(포트 5173, Worker가 허용하는 주소)를 띄워 쓴다.
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173/climate-citizen-platform-sim/';

export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: BASE, locale: 'ko-KR', timezoneId: 'Asia/Seoul', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run build && npx vite preview --config web/vite.config.ts --port 5173 --strictPort',
        url: BASE,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
