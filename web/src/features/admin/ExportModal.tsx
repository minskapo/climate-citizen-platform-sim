import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/ui';
import { showToast } from '../../components/Toast';
import { API_BASE, downloadBlob, simHeaders } from '../../lib/api';

/** 참가자 기록 내려받기: 운영용(활동명 포함) · 연구용(연구 활용에 동의한 사람만, 익명). 내려받으면 활동 기록에 남는다. */
export function ExportModal({ campaignId, researchCount, onClose }: { campaignId: string; researchCount: number; onClose(): void }) {
  const [kind, setKind] = useState<'ops' | 'research'>('ops');
  const [format, setFormat] = useState<'csv' | 'excel'>('csv');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/campaigns/${campaignId}/export?kind=${kind}`, { headers: simHeaders() });
      if (!res.ok) throw new Error('내려받지 못했어요');
      // 엑셀도 BOM이 붙은 CSV로 받는다: 엑셀에서 바로 열려요.
      downloadBlob(await res.blob(), `participants-${kind}-${campaignId}.csv`);
      showToast(`참가자 기록을 내려받았어요 · ${format === 'csv' ? 'CSV' : '엑셀'}`);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open onClose={onClose} title="참가자 기록 내려받기" description="내려받는 기록은 운영과 결과 보고에만 써요."
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button disabled={busy} onClick={() => void go()}>내려받기</Button></>}
    >
      <div className="ed-modal-form">
        <label className="adm-radio"><input type="radio" name="kind" checked={kind === 'ops'} onChange={() => setKind('ops')} />
          <span><b>운영용 · 참가자별 기록</b><small>활동명 · 지역 · 출발점 · 미션 기록 · 마무리 결과 (연락처 제외)</small></span></label>
        <label className="adm-radio"><input type="radio" name="kind" checked={kind === 'research'} onChange={() => setKind('research')} />
          <span><b>연구용 · 익명 집계</b><small>연구 활용에 동의한 {researchCount.toLocaleString('ko-KR')}명만, 개인을 알 수 없게 묶은 값</small></span></label>
        <div className="ed-row">
          <span className="ed-label">형식</span>
          <div className="ed-chips" role="radiogroup" aria-label="형식">
            {([['csv', 'CSV'], ['excel', '엑셀']] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={format === k} className={`ed-chip${format === k ? ' is-on' : ''}`} onClick={() => setFormat(k)}>{l}</button>
            ))}
          </div>
        </div>
        <p className="ed-hint">내려받은 기록은 관리자 활동 기록에 남아요.</p>
        {err && <p className="field-error" role="alert">{err}</p>}
      </div>
    </Modal>
  );
}
