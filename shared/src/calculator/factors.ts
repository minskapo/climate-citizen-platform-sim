/* Ported verbatim from wonju-15c (15c.igt.or.kr) index.html. Do not alter factors. */
/* 출처: 지역전환 도넛 1.5℃ 라이프스타일 계산기 (경기도용). 모든 값의 단위는 연간 tCO2e. */
export const CARBON_FACTORS = {
  food: {
    eatOut: 0.178,                 // 주당 외식·배달 1회
    diet:   [1.24, 0.80, 0.60],    // 매일 / 주3회 / 채식 위주
    coffee: 0.10,                  // 하루 3잔 이상
    waste:  0.001                  // 음식물 쓰레기가 자주 생김
  },
  consumption: {
    clothes: 0.03,                 // 새 옷 1벌
    mend:   -0.01,                 // 수선해 입은 옷 1벌
    appliances: [
      ["ricecooker","전기밥솥",0.26], ["fridge","냉장고",0.09], ["aircon","에어컨",0.11],
      ["tv","TV",0.22], ["vacuum","청소기",0.04], ["washer","세탁기",0.05],
      ["heatpad","전기장판",0.04], ["microwave","전자레인지",0.09],
      ["dishdryer","식기건조기",0.08], ["dryer","세탁건조기",0.42]
    ],
    devices: [
      ["phone","핸드폰",0.08], ["tablet","태블릿",0.05], ["laptop","노트북",0.06],
      ["desktop","데스크탑",0.09], ["watch","스마트워치",0.007]
    ],
    pets: [ ["cat","고양이",0.31], ["dog","강아지",0.77] ]
  },
  transport: {                     // 주당 이용 1시간 기준
    subway: 0.06, bus: 0.05, bike: 0.02, ev: 0.11, car: 0.16,
    flight: 0.16,                  // 지난 1년 항공기 이용 1시간
    /* 기차: 1km당 14gCO2e (연구소 제공), 평균 속도 시속 200km 적용.
       탄 시간으로 묻기 때문에 시간 → 거리 환산에 속도를 씁니다.
       1시간 = 200km × 14g = 2.8kg = 0.0028톤.
       속도 기준이 바뀌면 trainKmPerHour 한 줄만 고치면 됩니다. */
    trainKmPerHour: 200,
    trainGramPerKm: 14,
    get train(){ return this.trainKmPerHour * this.trainGramPerKm / 1000 / 1000; }
  },
  housing: {
    areaPerPyeong: 0.14,           // 1인당 주거면적 1평

    /* 전기 사용량: 월 kWh × 12개월 × 0.0004781 tCO2e/kWh
       (환경공단 지자체 온실가스 감축사업별 감축원단위 적용 가이드라인, 2023) */
    elecPerKwh: 0.0004781,
    elecKwh: [80, 200, 300, 400, 600],
    heatTypes: [
      ["gas","개별 가스보일러",      [0.231, 0.462, 0.693, 0.924, 0.945]],
      ["district","지역난방",        [0.270, 0.594, 0.891, 1.188, 1.215]],
      ["oil","개별 기름보일러",      [0.125, 0.250, 0.375, 0.500, 0.625]],
      ["central","중앙난방",         [0.270, 0.594, 0.891, 1.188, 1.215]],
      ["briquette","연탄",           [2.912, 5.831, 8.743,11.648,11.718]],
      ["electric","전기",            [0.2115,0.3337,0.4465,0.5875,0.5922]]
    ],
    solar: [0, -0.14, -0.50, -0.14],   // 아니오 / 아파트 / 단독주택 / 다세대주택
    insulationPerPyeong: -0.003,
    ai: [0.02, 0.007, 0.0005, 0]       // 매일1번+ / 주2~3번 / 월1번 / 안 씀
  },
  leisure: {
    tv: 0.11, mobile: 0.45, game: 0.07, book: 0.01,
    ski: 0.05, golf: 0.03, stay: 0.09
  }
} as const;
