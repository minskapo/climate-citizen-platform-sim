/** E2E 공용: 배포된 Worker에 직접 요청(초기화 등). 입장 암호는 SIM_PASSCODE 환경 변수에서만 읽는다. */
export const WORKER = process.env.E2E_API_BASE ?? 'https://climate-sim.minskapo.workers.dev';

export function passcode(): string {
  const p = process.env.SIM_PASSCODE;
  if (!p) throw new Error('SIM_PASSCODE 환경 변수를 주세요 (예: SIM_PASSCODE=… npx playwright test)');
  return p;
}

export async function enterToken(): Promise<string> {
  const res = await fetch(`${WORKER}/api/enter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passcode: passcode() }),
  });
  if (!res.ok) throw new Error(`입장 실패 ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

/** 체험 데이터를 모두 지운다(관리자 역할 + 입장 암호). */
export async function resetSim(): Promise<void> {
  const token = await enterToken();
  const res = await fetch(`${WORKER}/api/sim/reset`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Sim-Token': token, 'X-Role': 'admin' },
    body: JSON.stringify({ passcode: passcode() }),
  });
  if (!res.ok) throw new Error(`초기화 실패 ${res.status} ${await res.text()}`);
}
