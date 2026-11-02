import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/ui';
import { showToast } from '../../components/Toast';
import { apiBlob, ApiError, downloadBlob } from '../../lib/api';

/** 참가자 기록 내려받기: 운영용(활동명 포함) · 연구용(연구 활용에 동의한 사람만, 익명). 내려받으면 활동 기록에 남는다. */
export function ExportModal({ campaignId, researchCount, onClose }: { campaignId: string; researchCount: number; onClose(): void }) {
  const [kind, setKind] = useState<'ops' | 'research'>('ops');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      // 공용 호출: 입장이 만료되면(401) 입장 화면으로 돌아간다.
      const blob = await apiBlob(`/api/admin/campaigns/${campaignId}/export?kind=${kind}`, { quiet: true });
      // BOM이 붙은 CSV라 엑셀에서도 바로 열려요.
      downloadBlob(blob, `participants-${kind}-${campaignId}.csv`);
      showToast('참가자 기록을 내려받았어요 · CSV');
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError && e.code !== 'NETWORK' && e.status < 500 ? e.message : '내려받지 못했어요');
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
        <p className="ed-hint">CSV 파일로 받아요. 엑셀에서도 바로 열려요.</p>
        <p className="ed-hint">내려받은 기록은 관리자 활동 기록에 남아요.</p>
        {err && <p className="field-error" role="alert">{err}</p>}
      </div>
    </Modal>
  );
}
