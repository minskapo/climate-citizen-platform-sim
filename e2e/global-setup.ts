import { assertResetAllowed, resetSim } from './sim';

/** 시작 전에 체험 데이터를 비운다. E2E_ALLOW_RESET=1이 없으면 아무것도 지우지 않고 중단한다. */
export default async function globalSetup() {
  assertResetAllowed();
  await resetSim();
}
