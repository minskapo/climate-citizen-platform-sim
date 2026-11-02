import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../../components/Modal';
import { Button } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { showToast } from '../../../components/Toast';
import type { CampaignType } from '@shared/types';

type Key = 'host' | 'missions' | 'checklist' | 'materials';

/** 캠페인 복제하기: 지난 캠페인 설정을 가져와 새 초안을 연다. */
export function CloneModal({ source, onClose }: { source: { id: string; title: string; type: CampaignType }; onClose(): void }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState([...source.title].slice(0, 30).join(''));
  const [inc, setInc] = useState<Record<Key, boolean>>({ host: true, missions: true, checklist: true, materials: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rows: Array<[Key | null, string, boolean]> = [
    [null, '기본 정보 (설명 · 유형 · 방식 · 대표 이미지)', true],
    ['host', '주최 모임', inc.host],
    [null, source.type === 'practice' ? '신청 설정 (출발점 · 알림 · 동의)' : source.type === 'signature' ? '서명 설정 (요구안 · 설명 글 · 받는 정보)' : '신청 설정 (정원 · 묻는 것 · 출석 확인)', true],
    ...(source.type === 'practice' ? [['missions', '미션과 기록', inc.missions] as [Key, string, boolean]] : []),
    ['checklist', source.type === 'practice' ? '시작 전 체크리스트' : source.type === 'signature' ? '서명 후 안내' : '모임 전 체크리스트', inc.checklist],
    ['materials', '맞춤 영역과 쓰는 자료', inc.materials],
  ];

  const submit = async () => {
    setErr(null);
    if (!title.trim()) { setErr('새 캠페인 이름을 적어 주세요'); return; }
    setBusy(true);
    try {
      const r = await api<{ campaign: { id: string } }>(`/api/campaigns/${source.id}/clone`, { body: { title: title.trim(), include: inc } });
      showToast('캠페인을 복제했어요');
      navigate(`/admin/campaigns/${r.campaign.id}/edit`, { state: { clonedFrom: source.title } });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '복제하지 못했어요');
      setBusy(false);
    }
  };

  return (
    <Modal
      open onClose={onClose} title="캠페인 복제하기" description={`「${source.title}」의 설정을 가져와 새 캠페인을 만들어요.`}
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button disabled={busy} onClick={() => void submit()}>복제해서 열기</Button></>}
    >
      <div className="ed-modal-form">
        <label className="ed-row">
          <span className="ed-label">새 캠페인 이름</span>
          <div className="ed-input-count">
            <input className="input" maxLength={30} value={title} onChange={(e) => setTitle(e.target.value)} />
            <span className="ed-count">{[...title].length} / 30</span>
          </div>
        </label>
        <div className="ed-row">
          <span className="ed-label">가져올 설정</span>
          <ul className="ed-checks">
            {rows.map(([k, label, on]) => (
              <li key={label}>
                <label>
                  <input type="checkbox" checked={on} disabled={!k} onChange={() => k && setInc((x) => ({ ...x, [k]: !x[k] }))} />
                  {label}
                </label>
              </li>
            ))}
            <li className="is-off"><label><input type="checkbox" checked={false} disabled readOnly />참가자 · 게시글</label></li>
          </ul>
          <p className="ed-hint">일정은 비워 둔 채로 열려요. 참가자와 게시글은 복제되지 않아요.</p>
        </div>
        {err && <p className="field-error" role="alert">{err}</p>}
      </div>
    </Modal>
  );
}
