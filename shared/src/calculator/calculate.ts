/* Ported from wonju-15c index.html calculate(); reads answers from a parameter instead of global S. */
import { CARBON_FACTORS } from './factors';
import { SECTOR_KEYS } from './questions';
import { ACTIONS } from './actions';

export type Answers = Record<string, number | number[] | string[] | Record<string, number> | undefined>;

export const CONFIG = {
  TARGET_2030: 5.9, // 2030년 1.5℃ 라이프스타일 목표 (tCO2e/인/년)
  GLOBAL_AVG: 4.6, // 전 세계 1인당 배출량
  KOREA_AVG: 13.6, // 한국 1인당 배출량
  ACTIONS_TO_PICK: 3,
  SPLIT_HOUSEHOLD_ENERGY: true,
} as const;

export interface CalcResult {
  sectors: Record<'food' | 'consumption' | 'transport' | 'housing' | 'leisure', number>;
  total: number;
  gap: number;
  rate: number;
  parts: Record<string, number>;
  raw: { members: number; areaPerPerson: number };
  under: boolean;
  ans?: Answers;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

const num = (v: unknown, d = 0): number =>
  v === undefined || v === null || v === '' || isNaN(v as number) ? d : Number(v);
const sumCounts = (
  obj: Record<string, number> | undefined,
  items: ReadonlyArray<readonly [string, string, number]>,
): number => (items || []).reduce((s, [k, , c]) => s + num(obj && obj[k]) * c, 0);

export function calculate(answers: Answers): CalcResult {
  const a = answers as Loose;
  const F = CARBON_FACTORS;
  const p: Record<string, number> = {}; // 문항별 배출량

  // 먹거리
  p.eatOut = num(a.eatOut) * F.food.eatOut;
  p.diet = a.diet === undefined ? 0 : F.food.diet[a.diet as number];
  p.coffee = a.coffee === 1 ? F.food.coffee : 0;
  p.waste = a.waste === 1 ? F.food.waste : 0;
  const food = p.eatOut + p.diet + p.coffee + p.waste;

  // 소비
  p.clothes = num(a.clothes) * F.consumption.clothes;
  p.mend = num(a.mend) * F.consumption.mend; // 음수
  p.appliances = sumCounts(a.appliances, F.consumption.appliances);
  p.devices = sumCounts(a.devices, F.consumption.devices);
  p.pets = sumCounts(a.pets, F.consumption.pets);
  const consumption = p.clothes + p.mend + p.appliances + p.devices + p.pets;

  // 교통 (주당 시간 × 계수)
  p.subway = num(a.subway) * F.transport.subway;
  p.bus = num(a.bus) * F.transport.bus;
  p.bike = num(a.bike) * F.transport.bike;
  p.ev = num(a.ev) * F.transport.ev;
  p.car = num(a.car) * F.transport.car;
  p.train = num(a.train) * F.transport.train; // 시간 × (200km × 14g)
  p.flight = num(a.flight) * F.transport.flight;
  const transport = p.subway + p.bus + p.bike + p.ev + p.car + p.train + p.flight;

  // 주거
  const members = Math.max(1, num(a.members, 1));
  const areaPerPerson = num(a.areaTotal) / members;
  p.building = areaPerPerson * F.housing.areaPerPyeong;
  const ht = F.housing.heatTypes[a.heatType === undefined ? 0 : (a.heatType as number)];
  const div = CONFIG.SPLIT_HOUSEHOLD_ENERGY ? members : 1;
  const elecHouse =
    a.elec === undefined ? 0 : F.housing.elecKwh[a.elec as number] * 12 * F.housing.elecPerKwh;
  const heatHouse = a.heatCost === undefined ? 0 : (ht[2] as readonly number[])[a.heatCost as number];
  p.elecHouse = elecHouse;
  p.heatHouse = heatHouse;
  p.elec = elecHouse / div;
  p.heating = heatHouse / div;
  p.solar = F.housing.solar[a.solar || 0]; // 0 또는 음수
  p.insulation = a.insulation === 1 ? areaPerPerson * F.housing.insulationPerPyeong : 0;
  p.ai = a.ai === undefined ? 0 : F.housing.ai[a.ai as number];
  const housing = p.building + p.elec + p.heating + p.solar + p.insulation + p.ai;

  // 여가
  const ways: string[] = a.leisureWays || [];
  p.tv = ways.includes('tv') ? F.leisure.tv : 0;
  p.mobile = ways.includes('mobile') ? F.leisure.mobile : 0;
  p.game = ways.includes('game') ? F.leisure.game : 0;
  p.book = ways.includes('book') ? F.leisure.book : 0;
  p.ski = num(a.ski) * F.leisure.ski;
  p.golf = num(a.golf) * F.leisure.golf;
  p.stay = num(a.stay) * F.leisure.stay;
  const leisure = p.tv + p.mobile + p.game + p.book + p.ski + p.golf + p.stay;

  const sectors = {
    food: Math.max(0, food),
    consumption: Math.max(0, consumption),
    transport: Math.max(0, transport),
    housing: Math.max(0, housing),
    leisure: Math.max(0, leisure),
  };
  const total = SECTOR_KEYS.reduce((s, k) => s + sectors[k], 0);
  const gap = total - CONFIG.TARGET_2030;
  const rate = gap > 0 ? (gap / total) * 100 : 0;
  return { sectors, total, gap, rate, parts: p, ans: answers, raw: { members, areaPerPerson }, under: gap <= 0 };
}

export function actionPotential(actionId: string, r: CalcResult & { ans?: Answers }): number {
  const action = ACTIONS.find((x) => x.id === actionId);
  if (!action) throw new Error(`unknown action: ${actionId}`);
  return action.potential({ ...r, ans: r.ans ?? {} });
}
