import { showToast } from '../components/Toast';

/** HashRouter 경로를 공유할 수 있는 전체 주소로 바꾼다. 예: '/campaigns/1' */
export function shareUrl(path: string): string {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#${path.startsWith('/') ? path : `/${path}`}`;
}

/** 서명 공유 링크. 받은 사람이 서명하면 공유한 사람의 몫으로 센다. 예: https://…/#/campaigns/c1?ref=u1 */
export function buildShareUrl(campaignId: string, userId?: string | null): string {
  return shareUrl(`/campaigns/${campaignId}${userId ? `?ref=${encodeURIComponent(userId)}` : ''}`);
}

/** 공유 링크를 복사하고 토스트를 띄운다. */
export function copyShareLink(campaignId: string, userId?: string | null): Promise<boolean> {
  return copyText(buildShareUrl(campaignId, userId), '링크를 복사했어요');
}

export async function copyText(text: string, done = '주소를 복사했어요'): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(done);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand?.('copy') ?? false;
    ta.remove();
    showToast(ok ? done : '복사하지 못했어요');
    return ok;
  }
}

/** 기기 공유 창이 있으면 쓰고, 없으면 주소를 복사한다. */
export async function share(path: string, title: string): Promise<void> {
  const url = shareUrl(path);
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  await copyText(url);
}
