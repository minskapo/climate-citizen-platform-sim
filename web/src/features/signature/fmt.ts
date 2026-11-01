import { koShort } from '@shared/date';

export const n = (x: number) => x.toLocaleString('ko-KR');
/** 「2. 28.」 (요일 뺀 월 일) */
export const md = (d: string) => koShort(d).replace(/\(.\)$/, '');
