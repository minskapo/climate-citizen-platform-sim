import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api } from '../../lib/api';
import { showToast } from '../../components/Toast';
import { createBridgeHost, type Manifest } from './bridge';
import { injectBridge } from './template';
import './sandbox.css';

export interface PublishedTool { id: string; name: string; slug: string | null; version: number; html: string; manifest: Manifest; kind: 'block' | 'page' }

/** 게시 버전(관리자 미리보기는 ?version=N) 불러오기. 실패 사유는 status로 돌려준다. */
export function usePublishedTool(idOrSlug: string | undefined, version?: number) {
  const [state, setState] = useState<{ tool: PublishedTool | null; status: 'loading' | 'ok' | 'missing' | 'forbidden' }>({ tool: null, status: 'loading' });
  useEffect(() => {
    if (!idOrSlug) { setState({ tool: null, status: 'missing' }); return; }
    let alive = true;
    setState({ tool: null, status: 'loading' });
    const qs = version ? `?version=${version}` : '';
    api<PublishedTool>(`/api/tools/${encodeURIComponent(idOrSlug)}/published${qs}`, { quiet: true })
      .then((t) => { if (alive) setState(t && typeof t.html === 'string' && t.id ? { tool: t, status: 'ok' } : { tool: null, status: 'missing' }); })
      .catch((e: { status?: number }) => { if (alive) setState({ tool: null, status: e?.status === 403 ? 'forbidden' : 'missing' }); });
    return () => { alive = false; };
  }, [idOrSlug, version]);
  return state;
}

/**
 * 샌드박스 iframe 한 개 + 그 iframe 전용 브리지.
 * sandbox="allow-scripts"만 준다(allow-same-origin 없음) → 플랫폼 저장소 · 토큰에 닿지 못한다.
 */
export function ToolFrame({ tool, campaignId, preview, fill, style }: {
  tool: PublishedTool; campaignId?: string; preview: boolean; fill?: boolean; style?: CSSProperties;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);
  const srcDoc = useMemo(() => injectBridge(tool.html), [tool.html]);
  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    return createBridgeHost({ iframe, tool: { id: tool.id, manifest: tool.manifest }, campaignId, preview, onResize: setHeight, onToast: showToast });
  }, [tool.id, tool.manifest, campaignId, preview]);
  return (
    <iframe
      ref={ref}
      className={fill ? 'tool-frame tool-frame-fill' : 'tool-frame'}
      title={tool.name}
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      style={{ height: fill ? Math.max(height, 0) || undefined : height, ...style }}
      data-tool-id={tool.id}
    />
  );
}

/** 블록형 웹 도구. 높이는 블록이 알려 준 값(0–3000px), 그 전에는 0. 불러오지 못하면 아무것도 그리지 않는다. */
export function BlockFrame({ toolId, campaignId, preview = false, version }: { toolId: string; campaignId?: string; preview?: boolean; version?: number }) {
  const { tool } = usePublishedTool(toolId, version);
  if (!tool) return null;
  return <ToolFrame key={`${tool.id}:${tool.version}`} tool={tool} campaignId={campaignId} preview={preview} />;
}
