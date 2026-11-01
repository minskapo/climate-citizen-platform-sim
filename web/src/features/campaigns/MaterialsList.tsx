import { Link } from 'react-router-dom';
import { Chip } from '../../components/ui';
import { showToast } from '../../components/Toast';
import { downloadFile } from '../../components/useFileUrl';
import type { CampaignDetail } from './types';

const CALC = 'calculator';

/** 이 캠페인에서 쓰는 자료: 웹 도구(열기) · 파일(내려받기). 없으면 그리지 않는다. */
export function MaterialsList({ detail, title = '이 캠페인에서 쓰는 자료' }: { detail: CampaignDetail; title?: string }) {
  const { tools, files } = detail;
  const startTool = detail.campaign.settings.startPoint?.enabled ? detail.campaign.settings.startPoint.toolId : null;
  if (tools.length === 0 && files.length === 0) return null;
  return (
    <section className="cmat" aria-label={title}>
      <h2 className="csec-title">{title}</h2>
      <ul className="card cmat-list">
        {tools.map((t) => (
          <li key={t.toolId}>
            <div>
              <div className="cmat-tags"><Chip tone="blue" square>웹 도구</Chip><Chip tone="gray" square>웹</Chip><strong>{t.name || '웹 도구'}</strong>{t.exclusive && <Chip tone="outline" square>참가자 전용</Chip>}</div>
              {t.toolId === startTool && <p className="cmat-sub">시작할 때와 마칠 때 한 번씩 재요</p>}
            </div>
            <Link className="link-btn" to={t.toolId === CALC ? `/calculator?from=campaign&campaignId=${detail.campaign.id}` : `/tools/${t.toolId}`}>열기 →</Link>
          </li>
        ))}
        {files.map((f) => (
          <li key={f.id}>
            <div>
              <div className="cmat-tags"><Chip tone="gray" square>자료</Chip><strong>{f.name}</strong>{f.exclusive && <Chip tone="outline" square>참가자 전용</Chip>}</div>
              <p className="cmat-sub">{f.mime.split('/')[1]?.toUpperCase() ?? '파일'} · {Math.max(1, Math.round(f.bytes / 1024))}KB</p>
            </div>
            <button type="button" className="link-btn" onClick={() => downloadFile(f.id, f.name).then(() => showToast('파일을 내려받았어요')).catch((e) => showToast((e as Error).message))}>내려받기 ↓</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
