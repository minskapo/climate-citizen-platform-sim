import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Button, Chip, EmptyState, LoadError, Spinner } from '../../components/ui';
import { showToast } from '../../components/Toast';
import { api, ApiError } from '../../lib/api';
import { useAdminCrumbs } from './AdminLayout';

interface G { id: string; name: string; joinPolicy: string; region: string; memberCount: number; closedAt: string | null; createdAt: string }
const POLICY: Record<string, string> = { open: '바로 가입', approval: '승인 후 가입', private: '비공개' };

/** 모임: 모든 모임과 닫기 */
export function GroupsTable() {
  useAdminCrumbs(['모임']);
  const [items, setItems] = useState<G[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [target, setTarget] = useState<G | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ items: G[] }>('/api/admin/groups', { quiet: true }).then((r) => { setItems(r.items); setFailed(false); }).catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  const close = async () => {
    if (!target) return;
    try {
      await api(`/api/admin/groups/${target.id}/close`, { body: {} });
      showToast(`「${target.name}」 모임을 닫았어요`);
      setTarget(null);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '닫지 못했어요');
    }
  };

  return (
    <div>
      <div className="adm-head"><div><h1 className="adm-title">모임</h1><p className="adm-lead">모든 모임을 한눈에 보고, 운영 원칙에 맞지 않는 모임은 닫을 수 있어요.</p></div></div>
      {failed ? <LoadError onRetry={load} /> : !items ? <Spinner /> : items.length === 0 ? <EmptyState title="아직 모임이 없어요" /> : (
        <div className="adm-table-wrap card adm-table-card">
          <table className="adm-table">
            <thead><tr><th>모임</th><th>지역</th><th>가입 방식</th><th>인원</th><th>상태</th><th>관리</th></tr></thead>
            <tbody>
              {items.map((g) => (
                <tr key={g.id}>
                  <td className="adm-strong">{g.name}</td>
                  <td>{g.region || '전국'}</td>
                  <td>{POLICY[g.joinPolicy] ?? g.joinPolicy}</td>
                  <td>{g.memberCount.toLocaleString('ko-KR')}명</td>
                  <td>{g.closedAt ? <Chip tone="gray" square>닫힘</Chip> : <Chip tone="green" square>운영 중</Chip>}</td>
                  <td className="adm-actions">{g.closedAt ? '–' : <button type="button" aria-label={`${g.name} 닫기`} onClick={() => { setErr(null); setTarget(g); }}>모임 닫기</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {target && (
        <Modal open danger onClose={() => setTarget(null)} title={`「${target.name}」 모임을 닫을까요?`} description="닫힌 모임은 새 글과 가입을 받지 않아요. 진행 중인 캠페인을 주최하는 모임은 닫을 수 없어요."
          footer={<><Button variant="ghost" onClick={() => setTarget(null)}>취소</Button><Button variant="danger" onClick={() => void close()}>모임 닫기</Button></>}>
          {err && <p className="field-error" role="alert">{err}</p>}
        </Modal>
      )}
    </div>
  );
}
