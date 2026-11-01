import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { normalizeNickname } from '@shared/validate';
import { Button, EmptyState, Field, Spinner } from '../../components/ui';
import { showToast } from '../../components/Toast';
import { SIDO_LIST } from '../auth/regions';
import { SettingRows } from './RecordSettings';
import { reminderTime, useMe } from './useMe';
import './me.css';

/** 계정 설정: 활동명(중복 검사) · 지역 · 연구 활용 동의 · 미션 알림 시각 · 새 글 알림 */
export function AccountSettings() {
  const sim = useSim();
  const { me, save } = useMe();
  const [nick, setNick] = useState('');
  const [sido, setSido] = useState('');
  const [sigungu, setSigungu] = useState('');
  const [time, setTime] = useState('20:00');
  const [nickErr, setNickErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!me) return;
    setNick(me.nickname); setSido(me.sido); setSigungu(me.sigungu); setTime(reminderTime(me));
  }, [me]);

  if (sim.role === 'guest' || !sim.userId) {
    return <div className="container page"><EmptyState title="로그인하면 계정을 설정할 수 있어요" action={<Link to="/login" className="btn btn-primary btn-md">로그인</Link>} /></div>;
  }
  if (!me) return <div className="container page"><Spinner /></div>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNickErr(null);
    const n = normalizeNickname(nick);
    if (!n.ok) { setNickErr(n.error); return; }
    setBusy(true);
    try {
      await save({ nickname: n.value, sido, sigungu: sido ? sigungu.trim() : '', settings: { reminderTime: time || '20:00' } });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NICKNAME_TAKEN') setNickErr('이미 쓰고 있는 활동명이에요');
      else if (err instanceof ApiError && err.code === 'BAD_NICKNAME') setNickErr(err.message);
      else showToast('저장하지 못했어요. 다시 시도해 주세요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container page acct">
      <Link to="/me" className="acct-back">← 내 활동</Link>
      <h1 className="page-title">계정 설정</h1>
      <form className="card acct-form" onSubmit={submit}>
        <Field label="활동명" error={nickErr} hint="다른 시민에게 보이는 이름이에요.">
          <input className="input" value={nick} maxLength={20} aria-invalid={nickErr ? true : undefined} onChange={(e) => { setNick(e.target.value); setNickErr(null); }} />
        </Field>
        <Field label="지역">
          <div className="acct-region">
            <select className="input" aria-label="시도" value={sido} onChange={(e) => setSido(e.target.value)}>
              <option value="">전국 · 온라인</option>
              {SIDO_LIST.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className="input" aria-label="시군구" placeholder="시군구 (선택)" value={sigungu} disabled={!sido} onChange={(e) => setSigungu(e.target.value)} />
          </div>
        </Field>
        <Field label="미션 알림 기본 시각" hint="새 캠페인에 신청할 때 기본으로 쓰는 시각이에요.">
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" disabled={busy}>저장하기</Button>
      </form>
      <section className="card" aria-label="내 기록과 알림">
        <h2 className="mset-h">내 기록과 알림</h2>
        <SettingRows me={me} save={save} />
      </section>
    </div>
  );
}
