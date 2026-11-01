import { useRef, useState } from 'react';
import { blobToBase64, MAX_BYTES, shrinkImage } from '../lib/image';
import { Button } from './ui';

export interface Attachment { id: string; name: string; mime: string; bytes: number }
/** 새로 올리는 첨부는 dataBase64가 있고, 이미 올라간 첨부는 id만 있다. */
export interface NewAttachment { id?: string; name: string; mime: string; bytes: number; dataBase64?: string }

export const FILE_TOO_BIG = '파일은 1MB까지 올릴 수 있어요';
const MAX_FILES = 5;
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

export interface EditorProps {
  initial?: { title: string; body: string; attachments: Attachment[]; category?: string };
  categories: string[];
  allowNotice: boolean;
  /** 고칠 때는 첨부를 바꾸지 않는다 */
  attachable?: boolean;
  submitLabel?: string;
  onCancel?(): void;
  onSubmit(v: { category: string; title: string; body: string; attachments: NewAttachment[] }): Promise<void>;
}

/** 글쓰기: 제목 · 분류 · 본문(단락) · 이미지 · 파일. 본문의 http 주소는 보일 때 링크가 된다. */
export function Editor({ initial, categories, allowNotice, attachable = true, submitLabel = '올리기', onCancel, onSubmit }: EditorProps) {
  const options = categories.filter((c) => c !== '공지' || allowNotice);
  const [category, setCategory] = useState(initial?.category && options.includes(initial.category) ? initial.category : options.includes('자유') ? '자유' : options[0] ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [atts, setAtts] = useState<NewAttachment[]>(initial?.attachments ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const room = () => {
    if (atts.length >= MAX_FILES) { setError(`첨부는 ${MAX_FILES}개까지 올릴 수 있어요`); return false; }
    return true;
  };

  const addImage = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    if (!room()) return;
    try {
      const r = await shrinkImage(f);
      setAtts((l) => [...l, { name: f.name, mime: r.mime, bytes: r.bytes, dataBase64: r.dataBase64 }]);
    } catch (e) {
      setError((e as Error).message || '이미지를 올리지 못했어요');
    }
  };

  const addFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    if (f.size > MAX_BYTES) { setError(FILE_TOO_BIG); return; }
    if (!room()) return;
    try {
      setAtts((l) => [...l, { name: f.name, mime: f.type || 'application/octet-stream', bytes: f.size, dataBase64: '' }]);
      const data = await blobToBase64(f);
      setAtts((l) => l.map((a) => (a.name === f.name && a.dataBase64 === '' ? { ...a, dataBase64: data } : a)));
    } catch {
      setAtts((l) => l.filter((a) => !(a.name === f.name && a.dataBase64 === '')));
      setError('파일을 읽지 못했어요');
    }
  };

  const submit = async () => {
    setError(null);
    if (!title.trim()) { setError('제목을 써 주세요'); return; }
    if ([...title.trim()].length > 100) { setError('제목은 100자까지 쓸 수 있어요'); return; }
    if (!body.trim()) { setError('내용을 써 주세요'); return; }
    if (body.length > 10000) { setError('내용은 10,000자까지 쓸 수 있어요'); return; }
    if (atts.some((a) => a.dataBase64 === '')) { setError('파일을 읽는 중이에요. 잠시 뒤에 다시 눌러 주세요'); return; }
    setBusy(true);
    try {
      await onSubmit({ category, title: title.trim(), body, attachments: atts });
    } catch (e) {
      setError((e as Error).message || '올리지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="editor">
      {options.length > 0 && (
        <label className="field">
          <span className="field-label">분류</span>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {options.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      )}
      <label className="field">
        <span className="field-label">제목</span>
        <input className="input" value={title} maxLength={100} placeholder="제목을 써 주세요" onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">내용</span>
        <textarea className="input editor-body" rows={8} value={body} placeholder="내용을 써 주세요. 빈 줄로 단락을 나눠요. 외부 링크는 주소를 그대로 붙여 넣으면 링크가 돼요." onChange={(e) => setBody(e.target.value)} />
      </label>
      {!attachable && <p className="field-hint">첨부는 새 글에서만 바꿀 수 있어요</p>}
      {attachable && (
        <div className="editor-att">
          <div className="editor-att-btns">
            <Button variant="outline" size="sm" onClick={() => imgRef.current?.click()}>＋ 사진 붙이기</Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>＋ 파일 붙이기</Button>
            <span className="field-hint">파일은 1MB까지, {MAX_FILES}개까지 올릴 수 있어요</span>
          </div>
          <input ref={imgRef} type="file" accept="image/*" hidden aria-label="사진 고르기" onChange={(e) => { void addImage(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={fileRef} type="file" hidden aria-label="파일 고르기" onChange={(e) => { void addFile(e.target.files?.[0]); e.target.value = ''; }} />
          {atts.length > 0 && (
            <ul className="editor-files">
              {atts.map((a, i) => (
                <li key={a.id ?? `${a.name}-${i}`}>
                  {a.mime.startsWith('image/') && a.dataBase64 ? <img src={`data:${a.mime};base64,${a.dataBase64}`} alt="" /> : <span className="editor-ico" aria-hidden="true">📎</span>}
                  <span className="editor-fname">{a.name}</span>
                  <small>{kb(a.bytes)}</small>
                  <button type="button" className="editor-rm" aria-label={`${a.name} 빼기`} onClick={() => setAtts((l) => l.filter((_, j) => j !== i))}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="editor-foot">
        {onCancel && <Button variant="ghost" pill onClick={onCancel}>취소</Button>}
        <Button pill disabled={busy} onClick={() => void submit()}>{submitLabel}</Button>
      </div>
    </div>
  );
}
