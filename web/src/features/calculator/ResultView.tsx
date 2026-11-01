import { CONFIG, SECTOR_KEYS, type CalcResult } from '@shared/calculator';
import { Button } from '../../components/ui';
import { BudgetLine, fmt } from './BudgetLine';
import { SECTOR_NAME } from './SocialFoundation';

export interface CampaignCtx {
  title: string | null;
  kind: 'start' | 'end' | 'plain';
  startTotal: number | null;
  backPath: string;
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="calc-cmp-row">
      <span>{label}</span>
      <span className="calc-cmp-track"><i style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} /></span>
      <b>{fmt(value)}톤</b>
    </div>
  );
}

/** 결과: 총량 · 평균/목표/한국 평균 · 탄소 예산선 · 분야별 + 오른쪽 저장/가입 카드. */
export function ResultView({ result, avg, guest, campaign, onContinue, onRetry, onLeave, onSignup }: {
  result: CalcResult;
  avg: number | null;
  guest: boolean;
  campaign: CampaignCtx | null;
  onContinue: () => void;
  onRetry: () => void;
  onLeave: () => void;
  onSignup: (via?: 'kakao') => void;
}) {
  const T = CONFIG.TARGET_2030;
  const total = result.total;
  const over = total > T;
  const max = Math.max(total, avg ?? 0, T, 1);
  const sectors = SECTOR_KEYS.map((k) => [k, result.sectors[k]] as const).sort((a, b) => b[1] - a[1]);
  const diff = Math.abs(total - T);
  const cmp = avg === null ? '' : total < avg - 0.05 ? '참여자 평균보다 조금 적고, ' : total > avg + 0.05 ? '참여자 평균보다 많고, ' : '참여자 평균과 비슷하고, ';
  const isEnd = campaign?.kind === 'end' && campaign.startTotal !== null;
  const reduced = isEnd ? (campaign!.startTotal as number) - total : 0;
  const lead = isEnd
    ? `출발점 ${fmt(campaign!.startTotal as number)}톤보다 ${fmt(Math.abs(reduced))}톤 ${reduced >= 0 ? '줄었어요' : '늘었어요'}. 2030 1인당 목표까지 ${fmt(Math.max(0, total - T))}톤 남았어요.`
    : over ? `${cmp}2030 1인당 목표보다 ${fmt(diff)}톤 많아요.` : `${cmp}2030 1인당 목표 안쪽이에요. 목표보다 ${fmt(diff)}톤 적어요.`;

  return (
    <div className="calc-res">
      <section className="calc-card" aria-label="계산 결과">
        <p className="calc-lead">나의 1년 탄소배출량</p>
        <p className={`calc-total${over ? ' is-over' : ''}`}>{fmt(total)}<small>톤</small></p>
        <p className="calc-lead" style={{ color: 'var(--c-text)' }}>{lead}</p>
        <BudgetLine current={total} />
        <div className="calc-cmp">
          {avg !== null && <Bar label="참여자 평균" value={avg} max={max} color="#F2C14E" />}
          <Bar label="나" value={total} max={max} color="var(--c-green)" />
          <Bar label="2030 1인당 목표" value={T} max={max} color="var(--c-green-tint-2)" />
        </div>
        <h3 className="calc-h">어디서 가장 많이 나올까요?</h3>
        <div className="calc-sectors">
          {sectors.map(([k, v], i) => (
            <div key={k} className={`calc-sector${i === 0 ? ' is-top' : ''}`}>
              <span>{SECTOR_NAME[k]}</span>
              <b>{fmt(v)}톤</b>
              <small>{i === 0 ? '가장 많아요' : `${total > 0 ? Math.round((v / total) * 100) : 0}%`}</small>
            </div>
          ))}
        </div>
        <div className="calc-nav" style={{ marginTop: 'var(--s-6)' }}>
          <span />
          <Button size="lg" pill onClick={onContinue}>{over ? '다음: 감축 행동 고르기' : '다음: 사회적 기초 살펴보기'}</Button>
        </div>
      </section>
      <aside>
        {guest ? (
          <div className="calc-side">
            <span className="chip">결과가 아직 저장되지 않았어요</span>
            <h2>결과를 저장하고<br />이어 가 볼까요?</h2>
            <ul>
              <li>다시 재서 줄어든 만큼 확인하기</li>
              <li>나와 같은 정책을 고른 시민 수 보기</li>
              <li>우리 동네 캠페인과 모임 추천받기</li>
            </ul>
            <Button size="lg" block className="btn-kakao" onClick={() => onSignup('kakao')}>카카오로 3초 만에 저장하기</Button>
            <Button size="lg" block className="btn-white" onClick={() => onSignup()}>다른 방법으로 가입하기</Button>
            <button type="button" className="link" onClick={onLeave}>저장하지 않고 나가기</button>
          </div>
        ) : campaign && campaign.kind !== 'plain' ? (
          <div className="calc-side">
            <span className="chip">{campaign.title ?? '캠페인'} · {campaign.kind === 'end' ? '마무리' : '출발점'} 측정 저장됨</span>
            {isEnd ? (
              <>
                <h2>4주 동안<br />{fmt(Math.abs(reduced))}톤을 {reduced >= 0 ? '줄였어요' : '늘렸어요'}</h2>
                <div className="calc-startend">
                  <div><small>출발점</small>{fmt(campaign.startTotal as number)}톤</div>
                  <span aria-hidden="true">→</span>
                  <div><small>마무리</small>{fmt(total)}톤</div>
                </div>
              </>
            ) : (
              <h2>출발점이 저장됐어요</h2>
            )}
            <Button size="lg" block className="btn-white" onClick={onLeave}>캠페인으로 돌아가기</Button>
            <Button size="lg" block className="btn-line" onClick={onRetry}>다시 계산하기</Button>
          </div>
        ) : (
          <div className="calc-side">
            <span className="chip">나의 탄소 기록에 저장됨</span>
            <h2>결과가 저장됐어요</h2>
            <Button size="lg" block className="btn-white" onClick={onLeave}>내 활동에서 보기</Button>
            <Button size="lg" block className="btn-line" onClick={onRetry}>다시 계산하기</Button>
          </div>
        )}
        <p className="calc-foot-note" style={{ textAlign: 'left' }}>
          {guest
            ? '가입하지 않아도 이 화면을 닫기 전까지는 결과를 볼 수 있어요.'
            : campaign?.kind === 'end'
              ? '잘못 입력했다면 「다시 계산하기」로 고칠 수 있어요. 캠페인 기간 안에 잰 마지막 결과가 마무리 측정으로 쓰여요.'
              : ''}
        </p>
      </aside>
    </div>
  );
}
