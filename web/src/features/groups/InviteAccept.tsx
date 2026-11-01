import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui';
import { showToast } from '../../components/Toast';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';

/** 초대 링크로 들어온 비공개 모임: 가입하기. 링크는 7일 동안 쓸 수 있다. */
export function InviteAccept({ groupId, groupName, code, onJoined }: { groupId: string; groupName: string; code: string; onJoined(): void }) {
  const sim = useSim();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const join = async () => {
    if (sim.role === 'guest' || !sim.userId) { nav('/login'); return; }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/groups/${groupId}/join`, { body: { invite: code }, quiet: true });
      showToast('모임에 가입했어요');
      onJoined();
    } catch (e) {
      setError((e as Error).message || '가입하지 못했어요');
      setBusy(false);
    }
  };
  return (
    <div className="card ginvite">
      <h2>「{groupName}」에 초대받았어요</h2>
      <p>초대 링크는 만든 날부터 7일 동안 쓸 수 있어요.</p>
      <Button size="lg" disabled={busy} onClick={() => void join()}>초대받아 가입하기</Button>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}
