/* Ported verbatim from wonju-15c index.html. */
export type SectorKey = 'food' | 'consumption' | 'transport' | 'housing' | 'leisure';
export interface Question {
  id: string;
  type: 'num' | 'one' | 'yesno' | 'count' | 'multi';
  t: string;
  h?: string;
  plain?: boolean;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  o?: (string | string[])[];
  items?: string;
}
export const SECTOR_KEYS: SectorKey[] = ["food","consumption","transport","housing","leisure"];
/* 분야 제목 아래에 공통으로 붙는 안내 */
export const SECTION_NOTES: Partial<Record<SectorKey, string>> = {
  transport: "일상 출퇴근 외에 출장으로 인한 이동은 뺍니다."
};

export const QUESTIONS: Record<SectorKey, Question[]> = {
  food: [
    { id:"eatOut", type:"num", plain:true, unit:"회", t:"일주일에 외식을 하거나 배달음식을 먹는 횟수는?", max:30 },
    { id:"diet", type:"one", t:"다음 중 평소 식단을 가장 잘 설명하는 것을 하나 고르세요",
      o:["고기를 매일 먹는다","일주일에 3번 정도 먹는다","채식 위주로 먹는다"] },
    { id:"coffee", type:"yesno", t:"커피를 하루에 3잔 이상 마신다" },
    { id:"waste", type:"yesno", t:"남기거나 썩어서 버리는 음식 쓰레기가 자주 생긴다" }
  ],
  consumption: [
    { id:"clothes", type:"num", plain:true, unit:"벌", t:"지난 1년간 구매한 자신의 옷은 몇 벌인가요?",
      h:"신발과 속옷은 제외합니다.", max:200 },
    { id:"mend", type:"num", plain:true, unit:"벌", t:"지난 1년간 수선해서 입은 옷은 몇 벌인가요?", max:200 },
    { id:"appliances", type:"count", t:"갖고 있는 전자기기의 개수를 적어주세요",
      h:"없으면 0으로 두세요. 냉장고와 같은 공용 기기는 가구당 개수로 표시, 핸드폰 등 개인 기기는 자신의 것만 표시합니다.",
      items:"appliances" },
    { id:"devices", type:"count", t:"갖고 있는 기기의 개수를 적어주세요", items:"devices" },
    { id:"pets", type:"count", t:"함께 사는 반려동물이 있나요?", items:"pets" }
  ],
  transport: [
    { id:"subway", type:"num", unit:"시간", t:"일주일에 지하철을 타는 시간은?",
      h:"주중과 주말을 모두 합쳐서, 30분은 0.5시간으로 적어주세요.",
      step:0.5, max:60 },
    { id:"bus", type:"num", unit:"시간", t:"일주일에 버스를 타는 시간은?", step:0.5, max:60 },
    { id:"bike", type:"num", unit:"시간", t:"일주일에 자전거를 타는 시간은?", step:0.5, max:60 },
    { id:"ev", type:"num", unit:"시간", t:"일주일에 전기승용차를 타는 시간은?", step:0.5, max:60 },
    { id:"car", type:"num", unit:"시간", t:"일주일에 내연기관 승용차를 타는 시간은?",
      h:"직접 운전하거나 가족 차에 함께 타는 경우를 모두 포함합니다.", step:0.5, max:60 },
    { id:"train", type:"num", unit:"시간", t:"지난 1년간 기차를 탄 시간은 모두 몇 시간인가요?",
      h:"왕복 시간을 합쳐서 적어주세요. 30분은 0.5시간입니다. 편도 기준 원주–청량리 약 0.5시간, 원주–강릉 약 0.8시간, 서울–부산 약 2시간입니다.",
      step:0.5, max:500 },
    { id:"flight", type:"num", unit:"시간", t:"지난 1년간 비행기를 탄 시간은 모두 몇 시간인가요?",
      h:"왕복 시간을 합쳐서 적어주세요. (인천–도쿄 왕복 약 5시간, 인천–뉴욕 왕복 약 29시간)",
      step:0.5, max:300 }
  ],
  housing: [
    { id:"members", type:"num", unit:"명", t:"함께 사는 가구원은 몇 명인가요?",
      h:"본인을 포함한 인원수입니다. 혼자 사시면 1을 적어주세요. 주거 면적과 전기·난방 사용량을 이 인원수로 나누어 1인분으로 계산합니다.",
      min:0, max:12 },
    { id:"areaTotal", type:"num", unit:"평", t:"집 전체 면적은 몇 평인가요?",
      h:"1평은 약 3.3㎡입니다. 위에 적은 가구원 수로 나누어 1인당 면적을 계산합니다.", max:200 },
    { id:"elec", type:"one", t:"한 달 전기 사용량은 어느 정도인가요?",
      h:"집 전체의 사용량입니다. 고지서의 사용량(kWh)이나 청구금액 중 아는 쪽으로 고르세요. 여름·겨울이 아닌 보통 달을 기준으로 합니다.",
      o:["100kWh 이하 (약 1만원 이하)","200kWh 안팎 (약 2만원대)","300kWh 안팎 (약 4~5만원)",
         "400kWh 안팎 (약 7~8만원)","500kWh 넘음 (10만원 이상)"] },
    { id:"heatType", type:"one", t:"난방 형태를 고르세요",
      h:"지역에 열병합 발전소가 있다면 지역난방, 집에 개별 가스보일러가 있다면 개별 가스보일러입니다.",
      o:["개별 가스보일러","지역난방","개별 기름보일러","중앙난방","연탄","전기"] },
    { id:"heatCost", type:"one", t:"겨울철 난방비는 한 달 평균 얼마인가요?",
      h:"집 전체의 난방비입니다. 고지서의 청구금액을 기준으로 고르세요.",
      o:["10만원 이하 (가스 약 110㎥ / 전기 약 450kWh)","11~20만원 (가스 약 220㎥ / 전기 약 710kWh)",
         "21~30만원 (가스 약 330㎥ / 전기 약 950kWh)","31~40만원 (가스 약 440㎥ / 전기 약 1,250kWh)",
         "40만원 이상"] },
    { id:"solar", type:"one", t:"재생가능에너지로 생산한 전기를 사용하나요?",
      h:"사용한다면 주거 형태에 맞는 쪽을 고르세요.",
      o:["아니오","네 (아파트 거주)","네 (단독주택 거주)","네 (다세대주택 거주)"] },
    { id:"insulation", type:"yesno", t:"현재 주거지에 단열, 창호 개선을 한 적이 있나요?" },
    { id:"ai", type:"one", t:"인공지능 프로그램을 얼마나 사용하나요?",
      o:["매일 1번 이상","일주일에 2~3번","한 달에 한 번","안 쓴다"] }
  ],
  leisure: [
    { id:"leisureWays", type:"multi", t:"주로 여가 시간을 보내는 방법은?",
      h:"해당하는 것을 모두 고르세요.",
      o:[["tv","TV로 공중파·케이블·OTT 시청"],["mobile","모바일로 게임·동영상·SNS·인터넷"],
         ["game","게임"],["book","책읽기"]] },
    { id:"ski", type:"num", unit:"일", t:"지난 1년간 스키장에서 보낸 날은 며칠인가요?", max:120 },
    { id:"golf", type:"num", unit:"일", t:"지난 1년간 골프장을 찾은 날은 며칠인가요?", max:200 },
    { id:"stay", type:"num", unit:"일", t:"지난 1년간 여행지에서 숙박한 날은 며칠인가요?",
      h:"업무·출장으로 인한 숙박은 뺍니다.", max:200 }
  ]
};
