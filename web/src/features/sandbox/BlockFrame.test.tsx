import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BlockFrame } from './BlockFrame';
import { PageToolView } from './PageToolView';
import { BRIDGE_CLIENT } from './template';
import { __reloadSimForTest, simStore } from '../../lib/sim';

const tool = { id: 't1', name: '퀴즈', slug: 'quiz', version: 2, kind: 'block', html: '<html><head></head><body><p>hi</p></body></html>', manifest: { permissions: [], saveKeys: [], aggregateKeys: [], startPoint: false } };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  localStorage.clear();
  __reloadSimForTest();
  simStore.set({ token: 'tok', role: 'guest' });
});
afterEach(() => vi.unstubAllGlobals());

test('block frame: sandboxed, bridge injected, height 0 until resize', async () => {
  const f = vi.fn(async () => reply(tool));
  vi.stubGlobal('fetch', f);
  const { container } = render(<BlockFrame toolId="t1" campaignId="c1" />);
  const frame = await waitFor(() => { const el = container.querySelector('iframe'); if (!el) throw new Error('no iframe'); return el; });
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
  expect(frame.getAttribute('srcdoc')).toContain(BRIDGE_CLIENT);
  expect(frame.style.height).toBe('0px');
  // 브리지가 붙은 뒤(effect) 블록이 resize를 보내면 높이가 바뀐다.
  await waitFor(() => {
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { __bridge: 1, id: 1, method: 'resize', args: [240] }, source: frame.contentWindow })); });
    expect(frame.style.height).toBe('240px');
  });
  expect((f.mock.calls[0] as unknown as [string])[0]).toMatch(/\/api\/tools\/t1\/published$/);
});

test('block frame renders nothing when the tool is not published', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => reply({ error: { code: 'NOT_PUBLISHED', message: 'x' } }, 404)));
  const { container } = render(<BlockFrame toolId="t1" />);
  await new Promise((r) => setTimeout(r, 10));
  expect(container.innerHTML).toBe('');
});

test('page tool opens by slug with a back link', async () => {
  const f = vi.fn(async () => reply({ ...tool, kind: 'page' }));
  vi.stubGlobal('fetch', f);
  render(<MemoryRouter initialEntries={['/tools/quiz']}><Routes><Route path="/tools/:slug" element={<PageToolView />} /></Routes></MemoryRouter>);
  expect(await screen.findByTitle('퀴즈')).toHaveAttribute('sandbox', 'allow-scripts');
  expect(screen.getByRole('button', { name: '← 이전 화면' })).toBeInTheDocument();
  expect((f.mock.calls[0] as unknown as [string])[0]).toMatch(/\/api\/tools\/quiz\/published$/);
});

test('page tool: exclusive tool shows participant-only message', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => reply({ error: { code: 'FORBIDDEN', message: 'x' } }, 403)));
  render(<MemoryRouter initialEntries={['/tools/quiz']}><Routes><Route path="/tools/:slug" element={<PageToolView />} /></Routes></MemoryRouter>);
  expect(await screen.findByText('참가자만 쓸 수 있는 웹 도구예요')).toBeInTheDocument();
});
