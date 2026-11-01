import { Link } from 'react-router-dom';
import { EmptyState, Spinner } from '../../components/ui';
import { GroupCard } from '../groups/GroupCard';
import type { GroupView } from '../groups/types';
import '../groups/groups.css';

/** 모임: 이번 주 새 글이 많은 모임 4곳 */
export function GroupSection({ groups, member }: { groups: GroupView[] | null; member: boolean }) {
  const top = groups ? [...groups].sort((a, b) => (b.newPostsThisWeek ?? 0) - (a.newPostsThisWeek ?? 0)).slice(0, 4) : null;
  return (
    <section className="container hsec" aria-label="모임">
      <div className="hsec-head">
        <div>
          <h2 className="hsec-title">{member ? '우리 동네 모임' : '모임'}</h2>
          <p className="hsec-sub">늘 소통하는 단위예요. 공지·자료·기록은 모임 게시판에 쌓이고, 단톡방과도 연결할 수 있어요.</p>
        </div>
        <Link to="/groups" className="hsec-more">전체 모임 →</Link>
      </div>
      {top === null ? <Spinner /> : top.length === 0
        ? <EmptyState title="아직 열린 모임이 없어요">첫 모임을 열어 보세요.</EmptyState>
        : <div className="hgroups">{top.map((g) => <GroupCard key={g.id} g={g} />)}</div>}
    </section>
  );
}
