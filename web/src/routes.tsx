import { useRoutes, type RouteObject } from 'react-router-dom';
import { BareLayout, PlatformLayout } from './components/Layout';
import { NotFound, Placeholder } from './pages/Placeholder';
import { CalculatorPage } from './features/calculator/CalculatorPage';
import { SignupPage } from './features/auth/SignupPage';
import { LoginPicker } from './features/auth/LoginPicker';
import { OnboardingFlow } from './features/onboarding/OnboardingFlow';

/**
 * 화면 목록. 화면 작업(12–22)은 해당 줄의 element만 실제 화면으로 바꾼다.
 * HashRouter라 주소는 /#/campaigns 처럼 된다.
 */
export const platformRoutes: RouteObject[] = [
  { path: '/', element: <Placeholder title="홈" /> },
  { path: '/campaigns', element: <Placeholder title="캠페인" /> },
  { path: '/campaigns/:id', element: <Placeholder title="캠페인 자세히" /> },
  { path: '/groups', element: <Placeholder title="모임" /> },
  { path: '/groups/new', element: <Placeholder title="모임 열기" /> },
  { path: '/groups/:id', element: <Placeholder title="모임" /> },
  { path: '/groups/:id/manage', element: <Placeholder title="모임 관리" /> },
  { path: '/calculator', element: <CalculatorPage /> },
  { path: '/me', element: <Placeholder title="내 활동" /> },
  { path: '/me/settings', element: <Placeholder title="계정 설정" /> },
  { path: '/about', element: <Placeholder title="소개" /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/login', element: <LoginPicker /> },
  { path: '/onboarding/*', element: <OnboardingFlow /> },
  { path: '/tools/:slug', element: <Placeholder title="웹 도구" /> },
  { path: '/attend/:campaignId', element: <Placeholder title="출석" /> },
  { path: '/info/:slug', element: <Placeholder title="안내" /> },
  { path: '*', element: <NotFound /> },
];

/** 관리자 화면(M 계열)은 자체 옆 메뉴를 쓰므로 플랫폼 헤더 · 푸터 없이 둔다. */
export const adminRoutes: RouteObject[] = [
  { path: '/admin/*', element: <Placeholder title="관리자" /> },
];

export const routes: RouteObject[] = [
  { element: <PlatformLayout />, children: platformRoutes },
  { element: <BareLayout />, children: adminRoutes },
];

export function AppRoutes() {
  return useRoutes(routes);
}
