import { useState } from 'react';
import { koShort } from '@shared/date';
import type { ISODate, RecordField } from '@shared/types';
import { api } from '../../lib/api';
import { Modal } from '../../components/Modal';
import { showToast } from '../../components/Toast';
import { Button } from '../../components/ui';
import { RecordForm } from './RecordForm';

const DAYS = ['', '하루', '이틀', '사흘', '나흘', '닷새', '엿새', '이레'];

/** 다시 시작(H-3a): 3차례 연속 놓치면 오늘 탭 맨 위에 뜬다. */
export function ComebackBanner({ missed, participants, participationId, backfillable, fields, numberUnit, pauseUsed, daily, onToday, onChanged }: {
  missed: number; participants: number; participationId: string; backfillable: ISODate[]; fields: RecordField[]; numberUnit?: string;
  pauseUsed: boolean; daily: boolean; onToday(): void; onChanged(): void;
}) {
  const [filling, setFilling] = useState(false);
  const [slot, setSlot] = useState<ISODate | null>(null);
  const [busy, setBusy] = useState(false);
  const title = daily ? `${DAYS[missed] ?? `${missed}일`} 동안 기록이 없었어요` : `${missed}번 연속 기록이 없었어요`;
  const pause = async () => {
    setBusy(true);
    try {
      await api(`/api/participations/${participationId}/pause`, { method: 'POST', body: {}, quiet: true });
      showToast('일주일 쉬어 가요. 그동안 미션 알림이 오지 않아요');
      onChanged();
    } catch (e) {
      showToast((e as Error).message || '쉬어 가기를 하지 못했어요');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="comeback" aria-label="다시 시작">
      <h2>{title}</h2>
      <p>괜찮아요. 한 달 실천은 완벽하지 않아도 돼요.{participants > 1 ? ` ${participants.toLocaleString('ko-KR')}명이 함께하고 있어요.` : ''} 오늘 미션부터 다시 시작해 볼까요?</p>
      <div className="comeback-actions">
        <Button onClick={onToday}>오늘 미션 하기</Button>
        {backfillable.length > 0 && <Button variant="outline" onClick={() => { setSlot(backfillable[backfillable.length - 1]); setFilling(true); }}>지난 기록 채우기 (2{daily ? '일' : '차례'} 전까지)</Button>}
        {!pauseUsed && <button type="button" className="link-btn comeback-pause" disabled={busy} onClick={pause}>이번 주는 쉬어 가기 →</button>}
      </div>
      {filling && (
        <Modal open onClose={() => setFilling(false)} title="지난 기록 채우기" description="2차례 전까지의 기록만 채울 수 있어요." width={560}>
          <div className="backfill-days" role="radiogroup" aria-label="채울 날짜">
            {backfillable.map((d) => (
              <button key={d} type="button" role="radio" aria-checked={slot === d} className={`rform-check${slot === d ? ' on' : ''}`} onClick={() => setSlot(d)}>{koShort(d)}</button>
            ))}
          </div>
          {slot && (
            <RecordForm key={slot} participationId={participationId} slotDate={slot} fields={fields} numberUnit={numberUnit} compact
              onSaved={() => { setFilling(false); onChanged(); }} />
          )}
        </Modal>
      )}
    </section>
  );
}
