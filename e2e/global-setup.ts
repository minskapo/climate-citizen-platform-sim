import { resetSim } from './sim';

/** 시작 전에 체험 데이터를 비운다. */
export default async function globalSetup() {
  await resetSim();
}
