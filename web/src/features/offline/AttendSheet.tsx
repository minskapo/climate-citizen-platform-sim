import { useState } from 'react';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { Modal } from '../../components/Modal';
import { Button, Field } from '../../components/ui';
import type { CampaignDetail } from '../campaigns/types';
import { atTime, attendanceGate } from './util';

/** 6자리 출석 코드 입력 창. 휴대폰으로 QR을 찍으면 같은 처리가 /attend 주소에서 이어져요. */
export function AttendSheet({ detail, initialCode = '', onClose, onAttended }: {
  detail: CampaignDetail; initialCode?: string; onClose(): void; onAttended(time: string): void;
}) {
  const sim = useSim();
  const [code, setCode] = useState(initialCode.replace(/\D/g, '').slice(0, 6));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gate = attendanceGate(detail.campaign.schedule, sim.today, sim.nowTime);

  const submit = async () => {
    if (!gate.open) { setError(gate.message); return; }
    if (!/^\d{6}$/.test(code)) { setError('6자리 숫자를 넣어 주세요'); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ attended: boolean; at: string }>(`/api/campaigns/${detail.campaign.id}/attend`, { body: { code }, quiet: true });
      onAttended(atTime(r.at));
    } catch (e) {
      setError((e as Error).message || '출석하지 못했어요. 다시 시도해 주세요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open sheet onClose={onClose} title="QR 찍고 출석하기" width={480}
      description="운영진 화면에 보이는 6자리 코드를 넣어 주세요. 휴대폰 카메라로 QR을 찍으면 자동으로 출석돼요."
      footer={<><Button variant="outline" pill onClick={onClose}>취소</Button><Button pill onClick={submit} disabled={busy || !gate.open}>출석하기</Button></>}>
      <Field label="출석 코드" error={error}>
        <input
          className="input coff-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} placeholder="000000"
          aria-label="출석 코드" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
        />
      </Field>
      {!gate.open && !error && <p className="field-hint" role="status">{gate.message}</p>}
    </Modal>
  );
}

/** 출석 완료 창 */
export function AttendedModal({ detail, time, onClose }: { detail: CampaignDetail; time: string; onClose(): void }) {
  return (
    <Modal open onClose={onClose} title="출석했어요!" description={`${time} · ${detail.campaign.title}`} width={420}
      footer={<Button pill onClick={onClose}>확인</Button>}>
      <p>「참여 완료」로 기록됐어요. 끝난 뒤 후기와 사진을 부탁드릴게요.</p>
    </Modal>
  );
}
