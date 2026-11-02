import { useCallback, useEffect, useState } from 'react';
import { Chip, EmptyState, LoadError, Spinner } from '../../components/ui';
import { showToast } from '../../components/Toast';
import { api, ApiError } from '../../lib/api';
import { useAdminCrumbs } from './AdminLayout';

interface U { id: string; nickname: string; region: string; joinedAt: string; restricted: boolean }

/** 회원: 검색 · 이용 제한 켜기/풀기 */
export function UsersTable() {
  useAdminCrumbs(['회원']);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<U[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    const t = setTimeout(() => {
      api<{ items: U[] }>(`/api/admin/users${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`, { quiet: true })
        .then((r) => { setItems(r.items); setFailed(false); }).catch(() => setFailed(true));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => load(), [load]);

  const toggle = async (u: U) => {
    try {
      await api(`/api/admin/users/${u.id}/restrict`, { body: { restricted: !u.restricted } });
      setItems((l) => l?.map((x) => (x.id === u.id ? { ...x, restricted: !u.restricted } : x)) ?? l);
      showToast(u.restricted ? `${u.nickname}님의 이용 제한을 풀었어요` : `${u.nickname}님을 이용 제한했어요`);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : '처리하지 못했어요');
    }
  };

  return (
    <div>
      <div className="adm-head"><div><h1 className="adm-title">회원</h1><p className="adm-lead">연락처는 이 화면에 보이지 않아요. 이용 제한을 켜면 글 · 댓글 · 신청을 할 수 없어요.</p></div></div>
      <div className="adm-toolbar">
        <input className="input adm-search" placeholder="⌕  활동명 · 지역 검색" aria-label="회원 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {failed ? <LoadError onRetry={() => setQ((v) => v + '')} /> : !items ? <Spinner /> : items.length === 0 ? <EmptyState title="조건에 맞는 회원이 없어요" /> : (
        <div className="adm-table-wrap card adm-table-card">
          <table className="adm-table">
            <thead><tr><th>활동명</th><th>지역</th><th>가입일</th><th>상태</th><th>관리</th></tr></thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <td className="adm-strong">{u.nickname}</td>
                  <td>{u.region || '–'}</td>
                  <td>{u.joinedAt.slice(0, 10)}</td>
                  <td>{u.restricted ? <Chip tone="red" square>이용 제한</Chip> : <Chip tone="green" square>정상</Chip>}</td>
                  <td className="adm-actions"><button type="button" aria-label={`${u.nickname} ${u.restricted ? '제한 풀기' : '이용 제한'}`} onClick={() => void toggle(u)}>{u.restricted ? '제한 풀기' : '이용 제한'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
