import type { ReactNode } from 'react';

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

/** 본문의 http(s) 주소를 링크로 바꾼다. 문장 끝 구두점은 링크에서 뺀다. */
export function linkify(text: string): ReactNode[] {
  return text.split(URL_RE).map((part, i) => {
    if (i % 2 === 0) return part;
    const m = /^(.*?)([.,!?)\]」』]*)$/.exec(part);
    const href = m?.[1] ?? part;
    return (
      <span key={i}>
        <a href={href} target="_blank" rel="noopener noreferrer nofollow">{href}</a>
        {m?.[2]}
      </span>
    );
  });
}

/** 빈 줄로 나눈 단락 */
export function Paragraphs({ text }: { text: string }) {
  const paras = text.replace(/\r\n/g, '\n').split(/\n{2,}/).filter((p) => p.trim());
  return <div className="paras">{paras.map((p, i) => <p key={i}>{linkify(p)}</p>)}</div>;
}
