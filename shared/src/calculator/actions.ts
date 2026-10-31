/* Ported verbatim from wonju-15c index.html. */
import { CARBON_FACTORS } from './factors';
import type { CalcResult } from './calculate';
import type { SectorKey } from './questions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ActionInput = CalcResult & { ans: Record<string, any> };
export interface Action {
  id: string;
  sector: SectorKey;
  track: 'common' | 'car' | 'home' | 'leisure' | 'none';
  twoWeek: boolean;
  name: string;
  desc: string;
  potential: (r: ActionInput) => number;
}

export const ACTIONS: Action[] = [
  { id:"eatout_half", sector:"food", track:"common", twoWeek:true,
    name:"외식이나 배달 음식 횟수를 줄인다", desc:"지금의 절반으로 줄여봅니다.",
    potential:r=>r.parts.eatOut/2 },
  { id:"meat_less", sector:"food", track:"common", twoWeek:true,
    name:"고기 먹는 횟수를 줄인다", desc:"한 단계 아래 식단으로 옮겨봅니다.",
    potential:r=>r.parts.diet/2 },
  { id:"coffee_half", sector:"food", track:"common", twoWeek:true,
    name:"커피 마시는 횟수를 절반으로 줄인다", desc:"하루 마시는 잔 수를 절반으로.",
    potential:r=>r.parts.coffee/2 },

  { id:"clothes_less", sector:"consumption", track:"common", twoWeek:true,
    name:"연간 구매하는 옷을 절반으로 줄인다", desc:"1.5℃ 라이프스타일 기준인 연 5벌 수준까지.",
    potential:r=>Math.max(0, r.parts.clothes - 0.125) },
  { id:"clothes_long", sector:"consumption", track:"common", twoWeek:true,
    name:"구매한 옷은 가능한 오래 입는다", desc:"고쳐 입고, 빌려 입고, 물려 입습니다.",
    potential:r=>Math.max(0, r.parts.clothes * 0.2) },
  { id:"device_long", sector:"consumption", track:"common", twoWeek:false,
    name:"스마트폰·노트북의 교체주기를 두 배로 늘린다", desc:"쓰던 기기를 더 오래 씁니다.",
    potential:r=>r.parts.devices/2 },
  { id:"pet_less", sector:"consumption", track:"common", twoWeek:true,
    name:"반려동물을 위한 소비재를 줄인다", desc:"용품과 간식 구매를 줄입니다.",
    potential:r=>r.parts.pets/2 },

  { id:"car_to_transit", sector:"transport", track:"car", twoWeek:true,
    name:"내연기관 승용차 대신 대중교통을 이용한다", desc:"같은 시간을 지하철·버스로 바꿉니다.",
    potential:r=>Math.max(0, (r.ans.car||0) * (CARBON_FACTORS.transport.car - CARBON_FACTORS.transport.subway)) },
  { id:"ev_to_transit", sector:"transport", track:"car", twoWeek:true,
    name:"전기승용차 대신 대중교통을 이용한다", desc:"같은 시간을 지하철·버스로 바꿉니다.",
    potential:r=>Math.max(0, (r.ans.ev||0) * (CARBON_FACTORS.transport.ev - CARBON_FACTORS.transport.subway)) },
  { id:"car_weekday", sector:"transport", track:"car", twoWeek:true,
    name:"자가용은 출퇴근에만 이용하고 주말에는 쓰지 않는다", desc:"주말 운행을 뺍니다.",
    potential:r=>(r.parts.car + r.parts.ev)/3 },
  { id:"car_half", sector:"transport", track:"car", twoWeek:true,
    name:"자가용 이용을 절반으로 줄인다", desc:"주행 시간을 절반으로.",
    potential:r=>(r.parts.car + r.parts.ev)/2 },
  { id:"near_walk", sector:"transport", track:"car", twoWeek:true,
    name:"가까운 곳은 자전거나 도보로 이동한다", desc:"30분 안쪽 거리에서 차를 뺍니다.",
    potential:r=>(r.parts.car + r.parts.ev) * 0.2 },
  { id:"flight_half", sector:"transport", track:"none", twoWeek:false,
    name:"항공기 사용을 절반 이하로 줄인다", desc:"연간 비행 시간을 절반으로.",
    potential:r=>r.parts.flight/2 },
  { id:"flight_none", sector:"transport", track:"none", twoWeek:false,
    name:"항공기를 사용하지 않겠다", desc:"올해는 비행기를 타지 않습니다.",
    potential:r=>r.parts.flight },

  { id:"solar", sector:"housing", track:"none", twoWeek:false,
    name:"지붕태양광(3kW)이나 베란다 태양광(600W)을 설치하겠다", desc:"설치가 필요한 실천입니다.",
    potential:r=>{ const a = r.ans.solar || 0;
      if(a === 0) return (r.ans.solarType === 2) ? 0.50 : 0.14;   // 미설치 → 설치 시 감축
      return Math.abs(CARBON_FACTORS.housing.solar[a]); } },
  { id:"power30", sector:"housing", track:"home", twoWeek:true,
    name:"전기 사용량을 30%까지 줄이겠다", desc:"대기전력을 끊고 조명·가전 사용을 줄입니다.",
    potential:r=>Math.max(0.03, r.parts.elec * 0.3) },
  { id:"heat30", sector:"housing", track:"home", twoWeek:true,
    name:"난방 사용량을 30% 줄인다", desc:"설정온도를 낮추고 쓰는 시간을 줄입니다.",
    potential:r=>r.parts.heating * 0.333 },
  { id:"insulate", sector:"housing", track:"none", twoWeek:false,
    name:"단열, 창호 개선을 시도한다", desc:"공사가 필요한 실천입니다.",
    potential:r=>r.raw.areaPerPerson * 0.0013 },

  { id:"video_less", sector:"leisure", track:"leisure", twoWeek:true,
    name:"동영상 시청 시간을 줄인다", desc:"TV와 모바일 시청을 절반으로.",
    potential:r=>(r.parts.tv + r.parts.mobile)/2 },
  { id:"game_less", sector:"leisure", track:"leisure", twoWeek:true,
    name:"게임하는 시간을 줄인다", desc:"게임 시간을 절반으로.",
    potential:r=>r.parts.game/2 },
  { id:"ski_half", sector:"leisure", track:"none", twoWeek:false,
    name:"스키를 절반 이하로 줄인다", desc:"", potential:r=>r.parts.ski/2 },
  { id:"golf_none", sector:"leisure", track:"none", twoWeek:false,
    name:"골프를 하지 않는다", desc:"", potential:r=>r.parts.golf },
  { id:"travel_half", sector:"leisure", track:"leisure", twoWeek:true,
    name:"여행을 절반 이하로 줄인다", desc:"멀리 가는 대신 가까운 곳에서 쉽니다.",
    potential:r=>r.parts.stay/2 }
];
