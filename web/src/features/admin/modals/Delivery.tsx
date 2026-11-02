import { useEffect, useRef, useState } from 'react';
import { Modal } from '../../../components/Modal';
import { Button } from '../../../components/ui';
import { showToast } from '../../../components/Toast';
import { api, ApiError } from '../../../lib/api';
import { shrinkImage } from '../../../lib/image';

/** 전달 결과 올리기 (서명 캠페인): 요약 · 전달처 · 사진. 서명한 사람 모두에게 알림이 간다. */
export function DeliveryModal({ campaignId, defaultTarget, onClose }: { campaignId: string; defaultTarget?: string; onClose(): void }) {
  const [summary, setSummary] = useState('');
  const [councils, setCouncils] = useState(defaultTarget ?? '');
  const [photo, setPhoto] = useState<{ dataBase64: string; mime: string; name: string } | null>(null);
  const [had, setHad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ delivery: { summary: string; councils: string[] } | null }>(`/api/campaigns/${campaignId}/delivery`, { quiet: true })
      .then((r) => {
        if (!r.delivery) return;
        setHad(true);
        setSummary(r.delivery.summary);
        if (r.delivery.councils.length) setCouncils(r.delivery.councils.join(', '));
      })
      .catch(() => undefined);
  }, [campaignId]);

  const submit = async () => {
    setErr(null);
    if (!summary.trim()) { setErr('전달 결과를 적어 주세요'); return; }
    setBusy(true);
    try {
      await api(`/api/campaigns/${campaignId}/delivery`, {
        body: {
          summary: summary.trim(), councils: councils.split(/[,·\n]/).map((x) => x.trim()).filter(Boolean),
          ...(photo ? { photoBase64: photo.dataBase64, photoMime: photo.mime } : {}),
        },
      });
      showToast('전달 결과를 올렸어요 · 서명한 사람에게 알렸어요');
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '올리지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open onClose={onClose} title="전달 결과 올리기" description="올리면 서명한 사람 모두에게 알림이 가고 캠페인 상세 맨 위에 보여요."
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button disabled={busy} onClick={() => void submit()}>{had ? '다시 올리기' : '올리기'}</Button></>}
    >
      <div className="ed-modal-form">
        <label className="ed-row">
          <span className="ed-label">전달 결과</span>
          <textarea className="input ed-textarea" rows={4} maxLength={2000} value={summary} placeholder="예: 3월 10일 각 구의회에 서명 1,046명분을 전달했어요." onChange={(e) => setSummary(e.target.value)} />
        </label>
        <label className="ed-row">
          <span className="ed-label">전달처 (쉼표로 나눠요)</span>
          <input className="input" value={councils} placeholder="예: 마포구의회, 은평구의회" onChange={(e) => setCouncils(e.target.value)} />
        </label>
        <div className="ed-row">
          <span className="ed-label">전달 사진 (선택)</span>
          <div className="ed-dt">
            <Button variant="outline" size="sm" pill onClick={() => ref.current?.click()}>{photo ? '사진 바꾸기' : '사진 고르기'}</Button>
            {photo && <span className="ed-muted">{photo.name}</span>}
          </div>
          <input ref={ref} type="file" accept="image/*" hidden aria-label="전달 사진" onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const r = await shrinkImage(f);
              setPhoto({ dataBase64: r.dataBase64, mime: r.mime, name: f.name });
            } catch (x) {
              setErr((x as Error).message);
            }
          }} />
        </div>
        {err && <p className="field-error" role="alert">{err}</p>}
      </div>
    </Modal>
  );
}
