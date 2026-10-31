import type { ISODate } from './types';

const DAY_MS = 86_400_000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function parse(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function format(dt: Date): ISODate {
  return dt.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return format(new Date(parse(d).getTime() + n * DAY_MS));
}

/** to - from, in days */
export function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / DAY_MS);
}

/** Today's date in Asia/Seoul */
export function todayReal(): ISODate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function parts(d: ISODate) {
  const dt = parse(d);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), w: WEEKDAYS[dt.getUTCDay()] };
}

export function koShort(d: ISODate): string {
  const p = parts(d);
  return `${p.m}. ${p.d}.(${p.w})`;
}

export function koLong(d: ISODate): string {
  const p = parts(d);
  return `${p.y}. ${p.m}. ${p.d}.(${p.w})`;
}

const md = (d: ISODate) => {
  const p = parts(d);
  return `${p.m}. ${p.d}.`;
};
const ymd = (d: ISODate) => {
  const p = parts(d);
  return `${p.y}. ${p.m}. ${p.d}.`;
};

export function koRange(a: ISODate, b: ISODate): string {
  if (parts(a).y === parts(b).y) return `${md(a)}–${md(b)}`;
  return `${ymd(a)}–${ymd(b)}`;
}

export function dDay(today: ISODate, target: ISODate): string {
  const n = diffDays(today, target);
  if (n === 0) return 'D-day';
  return n > 0 ? `D-${n}` : `D+${-n}`;
}
