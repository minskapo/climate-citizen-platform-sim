import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { EmptyState } from '../../components/ui';
import { ToolFrame, usePublishedTool } from './BlockFrame';


/** 페이지형 웹 도구: /#/tools/:slug (?campaignId=). 상단바 아래 전체 폭 iframe. */
export function PageToolView() {
  const { slug } = useParams();
  const [sp] = useSearchParams();
  const campaignId = sp.get('campaignId') ?? undefined;
  const nav = useNavigate();
  const { tool, status } = usePublishedTool(slug);
  const goBack = () => (window.history.length > 1 ? nav(-1) : nav('/'));
  return (
    <div className="tool-page">
      <div className="tool-page-bar">
        <button type="button" className="tool-back" onClick={goBack}>← 이전 화면</button>
      </div>
      {tool ? (
        <ToolFrame key={`${tool.id}:${tool.version}`} tool={tool} campaignId={campaignId} preview={false} fill />
      ) : status === 'loading' ? null : (
        <div className="container page">
          {status === 'forbidden'
            ? <EmptyState title="참가자만 쓸 수 있는 웹 도구예요">캠페인에 참여하면 열 수 있어요.</EmptyState>
            : <EmptyState title="찾는 웹 도구가 없어요">주소를 다시 확인해 주세요.</EmptyState>}
        </div>
      )}
    </div>
  );
}
