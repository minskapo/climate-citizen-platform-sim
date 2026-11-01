import { EmptyState } from '../components/ui';

/** 아직 만들지 않은 화면. 각 화면 작업에서 routes.tsx의 element를 바꾼다. */
export function Placeholder({ title }: { title: string }) {
  return (
    <div className="container page">
      <h1 className="page-title">{title}</h1>
      <EmptyState title="준비 중이에요">이 화면은 곧 열려요.</EmptyState>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="container page">
      <EmptyState title="찾는 화면이 없어요">주소를 다시 확인해 주세요.</EmptyState>
    </div>
  );
}
