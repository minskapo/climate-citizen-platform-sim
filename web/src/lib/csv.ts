import { downloadBlob } from './api';

export type CsvCell = string | number | boolean | null | undefined;

function cell(v: CsvCell): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // 스프레드시트 수식 주입 막기
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

/** 엑셀에서 한글이 깨지지 않게 BOM을 붙여 내려받는다. */
export function downloadCsv(filename: string, header: string[], rows: CsvCell[][]) {
  downloadBlob(new Blob(['﻿' + toCsv(header, rows)], { type: 'text/csv;charset=utf-8' }), filename);
}
