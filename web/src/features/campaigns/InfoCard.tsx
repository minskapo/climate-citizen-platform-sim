import { koLong } from '@shared/date';
import { runEndOf, runLength, type CampaignDetail } from './types';

const rangeLong = (a: string, b: string) => `${koLong(a)} – ${a.slice(0, 4) === b.slice(0, 4) ? koLong(b).replace(/^\d+\. /, '') : koLong(b)}`;

const FEATURE: Record<string, string> = { check: '미션 체크', memo: '한 줄 메모', photo: '사진 인증', number: '숫자 기록', webtool: '웹 도구 기록' };

/** 캠페인 정보: 진행 기간 · 모집 기간 · 방식 · 참여 대상 · 함께 쓰는 기능 */
export function InfoCard({ detail }: { detail: CampaignDetail }) {
  const c = detail.campaign;
  const s = c.schedule;
  const st = c.settings;
  const rows: Array<[string, string]> = [];
  if (c.type === 'practice' && s.runStart && s.runDays) {
    rows.push(['진행 기간', `${rangeLong(s.runStart, runEndOf(c) ?? s.runStart)}, ${runLength(s.runDays)}`]);
  }
  if (c.type === 'offline' && s.eventDate) rows.push(['일시', `${koLong(s.eventDate)}${s.eventStart ? ` ${s.eventStart}` : ''}${s.eventEnd ? ` – ${s.eventEnd}` : ''}`]);
  if (s.recruitStart && s.recruitEnd) {
    rows.push([c.type === 'signature' ? '서명 기간' : '모집 기간', rangeLong(s.recruitStart, s.recruitEnd)]);
  }
  const mode = st.mode === 'online' ? '온라인' : st.mode === 'offline' ? '오프라인' : '온라인 · 오프라인';
  rows.push(['방식', c.type === 'practice' && st.recordEnabled !== false ? `${mode}${st.mode === 'offline' ? ' 모임' : ' 기록'}` : mode]);
  rows.push(['참여 대상', `누구나 (회원 가입 필요)${st.capacity ? ` · ${st.capacity.toLocaleString('ko-KR')}명까지` : ''}`]);
  if (c.type === 'practice') {
    const f = [st.recordEnabled === false ? null : st.recordCycle === 'daily' ? '매일 기록' : '정해진 날 기록',
      ...(st.recordEnabled === false ? [] : (st.recordFields ?? ['check']).map((k) => FEATURE[k]).filter(Boolean)), '참가자 게시판', '후기'];
    rows.push(['함께 쓰는 기능', f.filter(Boolean).join(' · ')]);
  }
  return (
    <section className="card cinfo" aria-label="캠페인 정보">
      <dl>
        {rows.map(([k, v]) => <div key={k} className="cinfo-row"><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
    </section>
  );
}
