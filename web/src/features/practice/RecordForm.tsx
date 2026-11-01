import { useRef, useState } from 'react';
import { koShort } from '@shared/date';
import type { ISODate, RecordField } from '@shared/types';
import { api } from '../../lib/api';
import { shrinkImage } from '../../lib/image';
import { useSim } from '../../lib/sim';
import { showToast } from '../../components/Toast';
import { Button } from '../../components/ui';
import { CHECK_LABEL, type Check, type RecordView } from './types';

const CHECKS: Check[] = ['done', 'partial', 'none'];

/** 미션 기록: 실천 체크(했어요 · 조금 했어요 · 못 했어요) + 설정된 항목(한 줄 메모 · 사진 · 숫자) + 게시판 인증. */
export function RecordForm({ participationId, slotDate, fields, numberUnit, compact, onSaved, initial, memoPlaceholder }: {
  participationId: string; slotDate: ISODate; fields: RecordField[]; numberUnit?: string; compact?: boolean; onSaved(): void;
  initial?: RecordView | null; memoPlaceholder?: string;
}) {
  const sim = useSim();
  const [check, setCheck] = useState<Check | null>(initial?.check ?? null);
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [num, setNum] = useState(initial?.number != null ? String(initial.number) : '');
  const [photo, setPhoto] = useState<{ dataBase64: string; name: string } | null>(null);
  const [alsoPost, setAlsoPost] = useState(!initial?.postId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const has = (f: RecordField) => fields.includes(f);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      const r = await shrinkImage(f);
      setPhoto({ dataBase64: r.dataBase64, name: f.name });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const save = async () => {
    if (!check) { setError('실천 체크를 골라 주세요'); return; }
    const body: Record<string, unknown> = { check };
    if (has('memo')) body.memo = memo.trim();
    if (has('number') && num.trim()) {
      const v = Number(num);
      if (!Number.isFinite(v)) { setError('숫자를 바르게 적어 주세요'); return; }
      body.number = v;
    }
    if (has('photo') && photo) body.photo = photo.dataBase64;
    if (alsoPost && !initial?.postId) body.alsoPost = true;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/participations/${participationId}/records/${slotDate}`, { method: 'PUT', body, quiet: true });
      showToast(slotDate === sim.today ? '오늘 기록을 저장했어요' : `${koShort(slotDate)} 기록을 채웠어요`);
      setPhoto(null);
      onSaved();
    } catch (e) {
      setError((e as Error).message || '기록을 저장하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rform${compact ? ' rform-compact' : ''}`}>
      <div className="rform-checks" role="radiogroup" aria-label="실천 체크">
        {CHECKS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={check === k} className={`rform-check${check === k ? ' on' : ''}`} onClick={() => { setCheck(k); setError(null); }}>
            {CHECK_LABEL[k]}
          </button>
        ))}
      </div>
      {has('number') && (
        <label className="rform-num">
          <input className="input" inputMode="decimal" aria-label={`숫자 기록${numberUnit ? ` (${numberUnit})` : ''}`} placeholder="숫자로 적어 주세요" value={num} onChange={(e) => setNum(e.target.value)} />
          {numberUnit && <span>{numberUnit}</span>}
        </label>
      )}
      {has('memo') && (
        <input className="input rform-memo" maxLength={100} aria-label="한 줄 메모" placeholder={memoPlaceholder ?? '한 줄 메모 (예: 점심에 비빔밥을 먹었어요)'} value={memo} onChange={(e) => setMemo(e.target.value)} />
      )}
      {has('webtool') && <p className="rform-note">이 캠페인은 웹 도구에서 기록한 값도 함께 저장돼요.</p>}
      <div className="rform-foot">
        {has('photo') && (
          <>
            <button type="button" className="link-btn" onClick={() => fileRef.current?.click()}>{photo ? `✓ ${photo.name}` : initial?.photoFileId ? '＋ 사진 바꾸기' : '＋ 사진 붙이기'}</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
          </>
        )}
        {!initial?.postId && (
          <label className="rform-also"><input type="checkbox" checked={alsoPost} onChange={(e) => setAlsoPost(e.target.checked)} /> 참가자 게시판에도 인증 올리기</label>
        )}
        <Button className="rform-save" onClick={save} disabled={busy}>{initial ? '기록 고치기' : '기록 저장'}</Button>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}
