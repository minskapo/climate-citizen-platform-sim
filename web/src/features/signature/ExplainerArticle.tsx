import { useState } from 'react';
import { koShort } from '@shared/date';
import { Paragraphs } from '../../components/linkify';
import { useFileUrl } from '../../components/useFileUrl';
import type { CampaignDetail } from '../campaigns/types';

interface Att { id: string; name: string; mime: string }

function Img({ a }: { a: Att }) {
  const { url, failed } = useFileUrl(a.id);
  if (failed) return <p className="sig-note">{a.name}을 불러오지 못했어요</p>;
  return url ? <img className="sig-img" src={url} alt={a.name} /> : <div className="sig-img sig-img-ph" aria-hidden="true" />;
}

const FOLD = 3;

/** 설명 글(편집기로 쓴 게시물): 본문 · 이미지. 단락이 길면 접어 둔다. */
export function ExplainerArticle({ detail }: { detail: CampaignDetail }) {
  const ex = detail.explainer;
  const [all, setAll] = useState(false);
  if (!ex) return null;
  const paras = ex.body.replace(/\r\n/g, '\n').split(/\n{2,}/).filter((p) => p.trim());
  const long = paras.length > FOLD;
  const text = long && !all ? paras.slice(0, FOLD).join('\n\n') : ex.body;
  const images = (ex.attachments as Att[]).filter((a) => a?.mime?.startsWith('image/'));
  return (
    <section className="card sig-explainer" id="explainer" aria-label="설명 글">
      <h2 className="csec-title">설명 글{ex.title ? ` · ${ex.title}` : ''}</h2>
      <Paragraphs text={text} />
      {(!long || all) && images.map((a) => <Img key={a.id} a={a} />)}
      <div className="sig-explainer-foot">
        <span className="sig-note">{detail.campaign.host.name}{ex.simDate ? ` · ${koShort(ex.simDate).replace(/\(.\)$/, '')} 작성` : ''}</span>
        {long && <button type="button" className="link-btn" onClick={() => setAll(!all)}>{all ? '접기' : '설명 글 전체 보기 →'}</button>}
      </div>
    </section>
  );
}
