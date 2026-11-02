import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/ui';
import { api } from '../../lib/api';
import type { CampaignDetail } from '../campaigns/types';

export const QR_REFRESH_MS = 60_000;

/** QR이 가리킬 주소: 휴대폰 카메라로 찍으면 출석 화면이 열려요. */
export const attendUrl = (campaignId: string, code: string) => `${location.origin}${import.meta.env.BASE_URL}#/attend/${campaignId}?code=${code}`;

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** 출석 QR: 6자리 코드 + QR을 띄우고 1분마다 새 코드로 바꾼다. */
export function AttendanceQrModal({ campaignId, start, end, onClose }: { campaignId: string; start: string | null; end: string | null; onClose(): void }) {
  const [code, setCode] = useState<string | null>(null);
  const [img, setImg] = useState('');
  const [open, setOpen] = useState(true);
  const [attended, setAttended] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await api<{ code: string; open: boolean }>(`/api/campaigns/${campaignId}/attendance-code`, { quiet: true });
        if (!alive) return;
        setCode(r.code); setOpen(r.open); setFailed(false);
        QRCode.toDataURL(attendUrl(campaignId, r.code), { margin: 1, width: 280 }).then((u) => alive && setImg(u)).catch(() => undefined);
        const d = await api<CampaignDetail>(`/api/campaigns/${campaignId}`, { quiet: true });
        if (alive && d.counts.attendedCount != null) setAttended({ done: d.counts.attendedCount, total: d.counts.seatsTaken });
      } catch {
        if (alive) setFailed(true);
      }
    };
    void tick();
    const t = setInterval(() => void tick(), QR_REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, [campaignId]);

  return (
    <Modal
      open onClose={onClose} title="출석 QR" description="현장에서 이 화면을 참가자에게 보여 주세요."
      footer={<Button onClick={onClose}>닫기</Button>}
    >
      <div className="adm-qr">
        {img ? <img src={img} alt="출석 QR" width={220} height={220} /> : <div className="adm-qr-ph" aria-hidden="true">QR</div>}
        <p className="adm-qr-code" aria-label="출석 코드">{code ?? '······'}</p>
        {failed && <p className="field-error" role="alert">코드를 가져오지 못했어요. 잠시 뒤 다시 시도해요</p>}
        {!open && !failed && <p className="ed-hint" role="status">지금은 출석을 받는 시간이 아니에요</p>}
        <p className="ed-hint">
          QR은 1분마다 바뀌어서 사진으로 찍어 돌려 쓸 수 없어요.
          {start && end ? ` ${hhmm(toMin(start) - 60)} – ${hhmm(toMin(end) + 60)}에 열려요` : ''}
          {attended ? ` · 지금 출석 ${attended.done.toLocaleString('ko-KR')} / ${attended.total.toLocaleString('ko-KR')}명` : ''}
        </p>
      </div>
    </Modal>
  );
}
