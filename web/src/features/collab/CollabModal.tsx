import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { showToast } from '../../components/Toast';
import { Button } from '../../components/ui';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';

export const COLLAB_COPY = '캠페인은 녹색전환연구소가 만들어요. 제안을 보내면 1일 안에 답변드리고, 함께 기획해 이 모임이 주최 모임이 돼요.';
export const COLLAB_COPY_NO_GROUP = '캠페인은 녹색전환연구소가 만들어요. 제안을 보내면 1일 안에 답변드리고, 함께 기획해요.';

/** 캠페인 협업 제안 창. 홈 · 캠페인 목록 · 새 모임 만들기 · 운영진 화면에서 연다. */
export function CollabModal({ groupId, onClose }: { groupId?: string; onClose(): void }) {
  const sim = useSim();
  const months = useMemo(() => {
    const [y, m] = sim.today.split('-').map(Number);
    return Array.from({ length: 12 }, (_, i) => {
      const t = (m - 1) + i + 1;
      return `${y + Math.floor(t / 12)}년 ${(t % 12) + 1}월`;
    });
  }, [sim.today]);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [idea, setIdea] = useState('');
  const [period, setPeriod] = useState('');
  const [size, setSize] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    let alive = true;
    api<{ name: string }>(`/api/groups/${groupId}`, { quiet: true }).then((g) => alive && setGroupName(g.name)).catch(() => undefined);
    return () => { alive = false; };
  }, [groupId]);

  const send = async () => {
    setError(null);
    if (!title.trim()) { setError('캠페인 이름(가제)을 써 주세요'); return; }
    if (!idea.trim()) { setError('하고 싶은 일을 써 주세요'); return; }
    setBusy(true);
    try {
      await api('/api/collab', { body: { title: title.trim(), idea: idea.trim(), period: period || months[0], size: size.trim(), groupId: groupId || undefined }, quiet: true });
      showToast('제안을 보냈어요 · 녹색전환연구소가 1일 안에 답변드려요');
      onClose();
    } catch (e) {
      setError((e as Error).message || '제안을 보내지 못했어요');
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="캠페인 협업 제안하기" description={groupId ? COLLAB_COPY : COLLAB_COPY_NO_GROUP} width={560}
      footer={<><Button variant="ghost" pill onClick={onClose}>취소</Button><Button pill disabled={busy} onClick={() => void send()}>제안 보내기</Button></>}>
      <div className="collab-form">
        <label className="field"><span className="field-label">캠페인 이름 (가제)</span>
          <input className="input" maxLength={60} value={title} placeholder="예: 원주천 플로깅 한 달" onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field"><span className="field-label">하고 싶은 일</span>
          <textarea className="input" rows={4} maxLength={2000} value={idea} placeholder="어떤 일을 누구와 함께 하고 싶은지 써 주세요" onChange={(e) => setIdea(e.target.value)} /></label>
        <div className="collab-row">
          <label className="field"><span className="field-label">희망 시기</span>
            <select className="input" value={period || months[0]} onChange={(e) => setPeriod(e.target.value)}>{months.map((m) => <option key={m}>{m}</option>)}</select></label>
          <label className="field"><span className="field-label">예상 인원</span>
            <input className="input" maxLength={100} value={size} placeholder="예: 30명 안팎" onChange={(e) => setSize(e.target.value)} /></label>
        </div>
        {groupId && <div className="field"><span className="field-label">주최 모임</span><p className="collab-group">{groupName ?? '불러오는 중…'}</p></div>}
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
