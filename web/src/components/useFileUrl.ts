import { useEffect, useState } from 'react';
import { API_BASE, downloadBlob, simHeaders } from '../lib/api';

/** 파일 API는 인증 헤더가 필요해서 <img src>로 바로 쓸 수 없다. 받아서 객체 주소로 바꿔 준다. */
export function useFileUrl(fileId: string | null | undefined): { url: string | null; failed: boolean } {
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({ url: null, failed: false });
  useEffect(() => {
    if (!fileId) { setState({ url: null, failed: false }); return; }
    let alive = true;
    let objectUrl: string | null = null;
    setState({ url: null, failed: false });
    fetch(`${API_BASE}/api/files/${encodeURIComponent(fileId)}`, { headers: simHeaders() })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('file'))))
      .then((b) => {
        objectUrl = URL.createObjectURL(b);
        if (alive) setState({ url: objectUrl, failed: false });
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => alive && setState({ url: null, failed: true }));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId]);
  return state;
}

/** 첨부 파일을 내려받는다. */
export async function downloadFile(fileId: string, name: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/files/${encodeURIComponent(fileId)}`, { headers: simHeaders() });
  if (!r.ok) throw new Error('파일을 내려받지 못했어요');
  downloadBlob(await r.blob(), name);
}
