import { ButtonLink } from '../../components/ui';
import { IGT_URL } from '../../components/Logo';
import './about.css';

const WHY = [
  ['혼자 하는 실천은 금방 멈춰요', '같이 기록하고 서로 북돋을 사람이 있을 때 실천이 오래가요. 플랫폼은 그 곁을 만들어요.'],
  ['현장의 기록이 흩어져 있었어요', '지역 워크숍과 공동실천의 기록이 단톡방·구글폼·엑셀에 흩어져, 끝나면 사라지곤 했어요.'],
  ['시민의 요구가 닿을 길이 필요해요', '실천하며 모인 시민의 목소리가 정책 제안으로 이어지는 상시 통로를 만들고자 해요.'],
];
const PARTS = [
  ['모임', '늘 소통하는 단위', '게시판과 댓글로 공지·자료·기록을 쌓고 단톡방과도 연결해요. 전국 모임과 지역 모임, 누구나·가입 승인·비공개를 고를 수 있어요.', '예: 원주 1.5도 참여자 모임, 기후정책 아카데미 동문 모임, 기후정보공유방'],
  ['캠페인', '기간을 정한 함께하는 실천', '누구나 참여할 수 있어요. 서명 · 실천 · 오프라인 모임으로 나뉘고, 실천 캠페인은 미션을 기록하며, 끝나면 후기를 나눠요.', '예: 새해 1.5도 한달살기, 한뼘기후공간 이달의 실천'],
  ['계산기', '나의 탄소 재기', '생활 습관으로 나의 1년 탄소배출량을 재요. 가입 없이 5분이면 되고, 캠페인을 마치며 다시 재서 비교해요.', '상단 메뉴의 「1.5도 계산기」에서 언제든 열 수 있어요'],
];
const START = [
  ['계산기', '1.5도 계산기로 출발점 재기', '가입 없이 5분이면 나의 1년 탄소배출량을 알 수 있어요.'],
  ['캠페인', '새해 1.5도 한달살기 참여하기', '설 연휴가 지나면 4주 동안 매일 미션을 기록해요.'],
  ['모임', '참가자 게시판에서 함께하기', '인증을 나누고, 끝나면 우리 동네 모임으로 이어 가요.'],
  ['모임', '우리 동네 모임 열기', '함께 실천할 동네 사람들과 모임을 열어 이어 가요.'],
];
const RULES = [
  ['누구나 모임을 열 수 있어요', '단체·공간·시민 누구나 모임을 열 수 있고, 연 곳의 이름이 앞에 나와요.'],
  ['자료는 모임 게시판에', '교안이나 활동 자료는 모임 게시판 「자료」에 누구나 올려요. 캠페인에서 쓰는 자료와 웹 도구는 녹색전환연구소가 캠페인에 붙여요.'],
  ['기록은 나와 운영자의 것이에요', '개별 기록은 본인과 캠페인·모임 운영자만 봐요. 연구소는 익명 집계만 쓰고, 연구 활용은 본인이 골라요.'],
  ['수다는 단톡방, 기록은 여기에', '실시간 대화는 단톡방에서, 공지·신청·자료·기록·후기처럼 남아야 하는 것은 플랫폼에 남겨요.'],
];

/** F 소개: 시안 문구 그대로 */
export function AboutPage() {
  return (
    <div className="about">
      <section className="container about-hero">
        <p className="about-eyebrow">기후시민플랫폼 소개</p>
        <h1>흩어진 관심을 모임과 캠페인으로 잇는 곳</h1>
        <p className="about-lead">기후시민플랫폼은 녹색전환연구소가 운영하는 시민 참여 플랫폼이에요.<br />우리 동네에서 함께 모이고 실천하며, 시민의 요구를 정책으로 전합니다.</p>
        <div className="about-cta">
          <ButtonLink to="/calculator" size="lg">1.5도 계산기로 시작하기</ButtonLink>
          <ButtonLink to="/campaigns" size="lg" variant="outline">새해 1.5도 한달살기 보기</ButtonLink>
        </div>
      </section>

      <section className="container about-sec" aria-labelledby="ab-why">
        <h2 id="ab-why">왜 만들었나요</h2>
        <div className="about-grid3">
          {WHY.map(([t, d]) => <div key={t} className="card"><h3>{t}</h3><p>{d}</p></div>)}
        </div>
      </section>

      <section className="container about-sec" aria-labelledby="ab-parts">
        <h2 id="ab-parts">모임과 캠페인, 그리고 1.5도 계산기</h2>
        <p className="about-sub">캠페인에서 함께 실천하고, 캠페인이 끝나면 모임에서 이어 가요. 1.5도 계산기로 시작과 끝을 재요.</p>
        <div className="about-grid3">
          {PARTS.map(([n, tag, d, ex]) => (
            <div key={n} className="card about-part">
              <span className="chip chip-green">{n}</span>
              <h3>{tag}</h3>
              <p>{d}</p>
              <small>{ex}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="container about-sec" aria-labelledby="ab-start">
        <h2 id="ab-start">처음이라면 이렇게 시작해요</h2>
        <ol className="about-grid4">
          {START.map(([chip, t, d], i) => (
            <li key={t} className="card"><span className="chip chip-gray">{chip}</span><b className="about-no">{i + 1}</b><h3>{t}</h3><p>{d}</p></li>
          ))}
        </ol>
      </section>

      <section className="container about-sec" aria-labelledby="ab-run">
        <h2 id="ab-run">이렇게 운영해요</h2>
        <div className="about-grid4">
          {RULES.map(([t, d]) => <div key={t} className="card"><h3>{t}</h3><p>{d}</p></div>)}
        </div>
      </section>

      <section className="container about-sec">
        <div className="card about-igt">
          <h2>녹색전환연구소</h2>
          <p>생태계의 수용능력 안에서, 누구나 기초적인 삶을 누리는 사회를 만들기 위해 노력하는 기후정책 싱크탱크예요.</p>
          <a className="btn btn-outline btn-md" href={IGT_URL} target="_blank" rel="noopener noreferrer">녹색전환연구소 홈페이지 ↗</a>
          <p className="about-contact">문의 · 피드백: <a href="mailto:office@igt.or.kr">office@igt.or.kr</a></p>
        </div>
      </section>
    </div>
  );
}
