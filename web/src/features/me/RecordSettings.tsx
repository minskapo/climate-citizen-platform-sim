import { useState } from 'react';
import { showToast } from '../../components/Toast';
import { reminderOn, reminderTime, useMe, type Me } from './useMe';
import { timeText } from '../practice/usePractice';

export function Toggle({ on, label, onChange, disabled }: { on: boolean; label: string; onChange(v: boolean): void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}><i /></button>
  );
}

/** 연구 활용 동의 · 미션 알림 · 새 글 알림. 바꾸는 즉시 저장한다. */
export function SettingRows({ me, save }: { me: Me; save: ReturnType<typeof useMe>['save'] }) {
  const [busy, setBusy] = useState(false);
  const run = async (patch: Parameters<typeof save>[0]) => {
    setBusy(true);
    try { await save(patch, true); } catch { showToast('저장하지 못했어요. 다시 시도해 주세요'); } finally { setBusy(false); }
  };
  return (
    <div className="mset">
      <div className="mset-row">
        <div><b>연구 활용 동의</b><p>내 기록을 익명 집계에 포함해 녹색전환연구소의 연구에 쓰도록 허락해요.</p></div>
        <Toggle on={!!me.consents.research} label="연구 활용 동의" disabled={busy} onChange={(v) => run({ consents: { research: v } })} />
      </div>
      <div className="mset-row">
        <div><b>미션 알림</b><p>기록할 차례에 아직 기록하지 않았으면 {timeText(reminderTime(me))}에 알려 드려요.</p></div>
        <Toggle on={reminderOn(me)} label="미션 알림" disabled={busy} onChange={(v) => run({ settings: { reminderOn: v } })} />
      </div>
      <div className="mset-row">
        <div><b>모임 새 글 알림</b><p>가입한 모임에 공지가 올라오면 알려 드려요.</p></div>
        <Toggle on={!!me.settings.newPostAlert} label="모임 새 글 알림" disabled={busy} onChange={(v) => run({ settings: { newPostAlert: v } })} />
      </div>
      <p className="mset-note">내 개별 기록은 나와 캠페인·모임 운영자만 볼 수 있어요.</p>
    </div>
  );
}

export function RecordSettingsCard() {
  const { me, save } = useMe();
  return (
    <section className="card" aria-label="내 기록과 알림">
      <h2 className="mset-h">내 기록과 알림</h2>
      {me ? <SettingRows me={me} save={save} /> : <p className="mset-note">불러오는 중이에요.</p>}
    </section>
  );
}
