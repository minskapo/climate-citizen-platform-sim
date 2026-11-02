/** 웹과 Worker가 함께 쓰는 문구 도우미. */

/** 서명 전달처 이름: 시군구 의회, 없으면 시도 의회. */
export const councilOf = (sido: string, sigungu: string): string =>
  sigungu ? `${sigungu}의회` : sido ? `${sido}의회` : '지역 미입력';

/** 신고로 글을 숨겼을 때 작성자에게 가는 알림 문구(관리자 창 안내와 같아야 한다). */
export const hiddenNoticeText = (reason: string): string => `운영 원칙(${reason})에 따라 글을 숨겼어요`;
