import { useRoutes, type RouteObject } from 'react-router-dom';
import { BareLayout, PlatformLayout } from './components/Layout';
import { NotFound, Placeholder } from './pages/Placeholder';
import { CalculatorPage } from './features/calculator/CalculatorPage';
import { SignupPage } from './features/auth/SignupPage';
import { LoginPicker } from './features/auth/LoginPicker';
import { OnboardingFlow } from './features/onboarding/OnboardingFlow';
import { GroupListPage } from './features/groups/GroupListPage';
import { NewGroupPage } from './features/groups/NewGroupPage';
import { GroupDetail } from './features/groups/GroupDetail';
import { GroupManage } from './features/groups/GroupManage';
import { PostPage } from './features/groups/PostPage';
import { CampaignListPage } from './features/campaigns/CampaignListPage';
import { CampaignDetailPage } from './features/campaigns/CampaignDetailPage';
import { HomePage } from './features/home/HomePage';
import { AboutPage } from './features/about/AboutPage';
import { MePage } from './features/me/MePage';
import { AccountSettings } from './features/me/AccountSettings';
import { AttendRoute } from './features/offline/AttendRoute';
import { Certificate } from './features/offline/Certificate';
import { CampaignPostPage } from './features/campaigns/CampaignPostPage';
import { PageToolView } from './features/sandbox/PageToolView';
import { AdminLayout, AdminPlaceholder } from './features/admin/AdminLayout';
import { AdminHome } from './features/admin/AdminHome';
import { CampaignAdminList } from './features/admin/CampaignAdminList';
import { CampaignEditor } from './features/admin/editor/CampaignEditor';

/**
 * 화면 목록. 화면 작업(12–22)은 해당 줄의 element만 실제 화면으로 바꾼다.
 * HashRouter라 주소는 /#/campaigns 처럼 된다.
 */
export const platformRoutes: RouteObject[] = [
  { path: '/', element: <HomePage /> },
  { path: '/campaigns', element: <CampaignListPage /> },
  { path: '/campaigns/:id', element: <CampaignDetailPage /> },
  { path: '/campaigns/:id/certificate', element: <Certificate /> },
  { path: '/campaigns/:id/posts/:postId', element: <CampaignPostPage /> },
  { path: '/groups', element: <GroupListPage /> },
  { path: '/groups/new', element: <NewGroupPage /> },
  { path: '/groups/:id', element: <GroupDetail /> },
  { path: '/groups/:id/manage', element: <GroupManage /> },
  { path: '/groups/:id/posts/:postId', element: <PostPage /> },
  { path: '/calculator', element: <CalculatorPage /> },
  { path: '/me', element: <MePage /> },
  { path: '/me/settings', element: <AccountSettings /> },
  { path: '/about', element: <AboutPage /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/login', element: <LoginPicker /> },
  { path: '/onboarding/*', element: <OnboardingFlow /> },
  { path: '/tools/:slug', element: <PageToolView /> },
  { path: '/attend/:campaignId', element: <AttendRoute /> },
  { path: '/info/:slug', element: <Placeholder title="안내" /> },
  { path: '*', element: <NotFound /> },
];

/** 관리자 화면(M 계열)은 자체 옆 메뉴를 쓰므로 플랫폼 헤더 · 푸터 없이 둔다. */
export const adminRoutes: RouteObject[] = [
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <AdminHome /> },
      { path: 'campaigns', element: <CampaignAdminList /> },
      { path: 'campaigns/new', element: <CampaignEditor /> },
      { path: 'campaigns/:id/edit', element: <CampaignEditor /> },
      // Task 21: 참가자 관리 · 웹 도구 · 신고 · 협업 제안 · 모임 · 회원 · 데이터
      { path: 'campaigns/:id/participants', element: <AdminPlaceholder title="참가자" /> },
      { path: 'tools/*', element: <AdminPlaceholder title="웹 도구" /> },
      { path: 'groups', element: <AdminPlaceholder title="모임" /> },
      { path: 'reports', element: <AdminPlaceholder title="신고" /> },
      { path: 'collab', element: <AdminPlaceholder title="협업 제안" /> },
      { path: 'users', element: <AdminPlaceholder title="회원" /> },
      { path: 'data', element: <AdminPlaceholder title="데이터 · 통계" /> },
      { path: '*', element: <AdminPlaceholder title="찾을 수 없는 화면" /> },
    ],
  },
];

export const routes: RouteObject[] = [
  { element: <PlatformLayout />, children: platformRoutes },
  { element: <BareLayout />, children: adminRoutes },
];

export function AppRoutes() {
  return useRoutes(routes);
}
