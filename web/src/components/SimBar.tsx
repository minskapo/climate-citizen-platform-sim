import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Role } from '@shared/types';
import { koShort } from '@shared/date';
import { api, ApiError, downloadBlob } from '../lib/api';
import { useSim } from '../lib/sim';
import { GroupPicker } from './GroupPicker';
import { Modal } from './Modal';
import { NicknamePicker, type UserLite } from './NicknamePicker';
import { showToast } from './Toast';
import { Button } from './ui';

export const ROLE_LABEL: Record<Role, string> = { guest: '비회원', member: '회원', staff: '모임 운영진', admin: '관리자' };
const ROLE_ORDER: Role[] = ['guest', 'member', 'staff', 'admin'];

/** 체험 도구 막대: 실제 플랫폼에는 없는 체험용 장치. 헤더 위 어두운 회색 띠. */
export function SimBar() {
  const sim = useSim();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false); // 모바일 펼침
  const [nickOpen, setNickOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  /** 활동명을 고른 뒤 이어서 바꿀 역할 */
  const [pendingRole, setPendingRole] = useState<Role | null>(null);

  const leaveAdmin = (next: Role) => {
    if (sim.role === 'admin' && next !== 'admin') navigate('/');
  };

  const applyRole = (r: Role, hasUser = !!sim.userId) => {
    if (r !== 'guest' && !hasUser) {
      setPendingRole(r);
      setNickOpen(true);
      return;
    }
    if (r === 'staff') {
      setGroupOpen(true);
      return;
    }
    leaveAdmin(r);
    sim.setRole(r);
    if (r === 'admin') navigate('/admin');
  };

  const pickUser = (u: UserLite) => {
    sim.setUser(u.id, u.nickname);
    setNickOpen(false);
    const next = pendingRole ?? (sim.role === 'guest' ? 'member' : sim.role);
    setPendingRole(null);
    applyRole(next, true);
    showToast(`${u.nickname} 님으로 들어왔어요`);
  };

  const pickGroup = (id: string) => {
    leaveAdmin('staff');
    sim.setStaffGroup(id);
    setGroupOpen(false);
  };

  const signOut = () => {
    leaveAdmin('guest');
    sim.signOut();
    setNickOpen(false);
    showToast('로그아웃했어요');
  };

  const exportData = async () => {
    try {
      const data = await api<unknown>('/api/sim/export');
      downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `climate-sim-export-${sim.realToday}.json`);
      showToast('체험 데이터를 내려받았어요');
    } catch (e) {
      if (e instanceof ApiError && e.status < 500 && e.code !== 'DAILY_CAP') showToast(e.message);
    }
  };

  const dateChanged = sim.today !== sim.realToday;

  return (
    <div className={`simbar${open ? ' is-open' : ''}`} role="region" aria-label="체험 도구">
      <div className="simbar-in">
        <button type="button" className="simbar-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span className="simbar-tag">체험 도구</span>
          <span className="simbar-summary">
            {ROLE_LABEL[sim.role]}{sim.nickname && sim.role !== 'guest' ? ` · ${sim.nickname}` : ''} · {koShort(sim.today)}
          </span>
          <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
        <span className="simbar-tag simbar-tag-desk">체험 도구</span>

        <div className="simbar-body">
          <label className="simbar-item">
            <span className="simbar-label">지금 역할</span>
            <select
              aria-label="지금 역할"
              className="simbar-input"
              value={sim.role}
              onChange={(e) => applyRole(e.target.value as Role)}
            >
              {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            {sim.role === 'staff' && (
              <button type="button" className="simbar-btn" onClick={() => setGroupOpen(true)}>
                {sim.staffGroupId ? '모임 바꾸기' : '모임 고르기'}
              </button>
            )}
          </label>

          <div className="simbar-item">
            <span className="simbar-label">활동명</span>
            <strong className="simbar-value">{sim.nickname ?? '없음'}</strong>
            <button type="button" className="simbar-btn" onClick={() => { setPendingRole(null); setNickOpen(true); }}>바꾸기</button>
          </div>

          <div className="simbar-item">
            <label className="simbar-label" htmlFor="simbar-date">내 날짜</label>
            <input
              id="simbar-date"
              aria-label="내 날짜"
              type="date"
              className={`simbar-input${dateChanged ? ' is-changed' : ''}`}
              value={sim.today}
              onChange={(e) => e.target.value && sim.setDate(e.target.value)}
            />
            <button type="button" className="simbar-btn" onClick={() => sim.shiftDays(-1)}>−1</button>
            <button type="button" className="simbar-btn" onClick={() => sim.shiftDays(1)}>+1</button>
            <button type="button" className="simbar-btn" onClick={() => sim.shiftDays(7)}>+7</button>
            <button type="button" className="simbar-btn" disabled={!dateChanged && sim.fixedDate === null} onClick={() => sim.setDate(null)}>오늘로</button>
          </div>

          <div className="simbar-item">
            <label className="simbar-label" htmlFor="simbar-time">시각 바꾸기</label>
            <input
              id="simbar-time"
              aria-label="시각"
              type="time"
              className={`simbar-input${sim.timeOverride ? ' is-changed' : ''}`}
              value={sim.nowTime}
              onChange={(e) => sim.setTime(e.target.value || null)}
            />
            <button type="button" className="simbar-btn" disabled={!sim.timeOverride} onClick={() => sim.setTime(null)}>지금으로</button>
          </div>

          {sim.role === 'admin' && (
            <div className="simbar-item simbar-admin">
              <button type="button" className="simbar-btn" onClick={exportData}>체험 데이터 내보내기</button>
              <button type="button" className="simbar-btn simbar-danger" onClick={() => setResetOpen(true)}>초기화</button>
            </div>
          )}
        </div>
      </div>

      <NicknamePicker
        open={nickOpen}
        onClose={() => { setNickOpen(false); setPendingRole(null); }}
        onPick={pickUser}
        currentId={sim.userId}
        onSignOut={signOut}
      />
      <GroupPicker open={groupOpen} onClose={() => setGroupOpen(false)} onPick={pickGroup} currentId={sim.staffGroupId} />
      <ResetModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onDone={() => {
          setResetOpen(false);
          sim.signOut();
          navigate('/');
          showToast('체험 데이터를 모두 지웠어요');
        }}
      />
    </div>
  );
}

function ResetModal({ open, onClose, onDone }: { open: boolean; onClose(): void; onDone(): void }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setPasscode('');
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!passcode) return setError('입장 암호를 입력해 주세요');
    setBusy(true);
    setError(null);
    try {
      await api('/api/sim/reset', { method: 'POST', body: { passcode }, quiet: true });
      setPasscode('');
      onDone();
    } catch (e) {
      const err = e as ApiError;
      setError(err.code === 'BAD_PASSCODE' ? '입장 암호가 맞지 않아요' : err.code === 'TOO_MANY_ATTEMPTS' ? '잠시 후 다시 시도해 주세요' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      danger
      title="체험 데이터를 모두 지울까요?"
      description="모든 사람의 가입 · 모임 · 캠페인 · 기록이 지워지고 되돌릴 수 없어요. 먼저 「체험 데이터 내보내기」로 백업해 두세요."
      footer={
        <>
          <Button variant="outline" pill onClick={close}>취소</Button>
          <Button variant="danger" pill disabled={busy} onClick={submit}>모두 지우기</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label className="field">
          <span className="field-label">입장 암호 다시 입력</span>
          <input className="input" type="password" autoComplete="off" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
          {error && <span className="field-error" role="alert">{error}</span>}
        </label>
      </form>
    </Modal>
  );
}
