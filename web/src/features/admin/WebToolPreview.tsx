import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '../../components/ui';
import { ToolFrame, usePublishedTool } from '../sandbox/BlockFrame';
import { useAdminCrumbs } from './AdminLayout';

/** M-3a 웹 도구 미리보기: 대기 중인 버전을 테스트 계정으로 연다. 저장한 기록은 미리보기 기록으로만 남는다(preview). */
export function WebToolPreview() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const version = Number(sp.get('v')) || undefined;
  const nav = useNavigate();
  const { tool, status } = usePublishedTool(id, version);
  const [mobile, setMobile] = useState(false);
  useAdminCrumbs(['웹 도구', tool ? `${tool.name} v${tool.version} 미리보기` : '미리보기']);

  if (status === 'loading') return <Spinner />;
  if (!tool) return <EmptyState title="미리볼 웹 도구를 찾지 못했어요" action={<Button pill onClick={() => nav('/admin/tools')}>웹 도구로 돌아가기</Button>} />;
  return (
    <div className="adm-preview">
      <div className="adm-preview-bar">
        <div>
          <b>미리보기</b>
          <p className="adm-muted">{tool.name} v{tool.version} · 테스트 계정으로 열었어요 · 여기서 저장한 기록은 실제 기록에 섞이지 않아요</p>
        </div>
        <div className="adm-head-actions">
          <div className="ed-chips" role="radiogroup" aria-label="화면 크기">
            <button type="button" role="radio" aria-checked={!mobile} className={`ed-chip${!mobile ? ' is-on' : ''}`} onClick={() => setMobile(false)}>데스크탑</button>
            <button type="button" role="radio" aria-checked={mobile} className={`ed-chip${mobile ? ' is-on' : ''}`} onClick={() => setMobile(true)}>모바일</button>
          </div>
          <Button variant="outline" pill onClick={() => nav('/admin/tools')}>닫기 ✕</Button>
        </div>
      </div>
      <div className={`adm-preview-stage${mobile ? ' is-mobile' : ''}`}>
        <ToolFrame key={`${tool.id}:${tool.version}`} tool={tool} preview fill={tool.kind === 'page'} />
      </div>
    </div>
  );
}
