import { describe, expect, test, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCampaignDetail } from './CampaignDetailPage';

const resolvers: Record<string, (v: unknown) => void> = {};
vi.mock('../../lib/api', () => ({
  ApiError: class extends Error { status = 0; },
  API_BASE: '',
  simHeaders: () => ({}),
  api: vi.fn((path: string) => new Promise((res) => { resolvers[path] = res; })),
}));

describe('useCampaignDetail', () => {
  test('a late response for the previous campaign does not overwrite the current one', async () => {
    const { result, rerender } = renderHook(({ id }) => useCampaignDetail(id), { initialProps: { id: 'c1' } });
    await waitFor(() => expect(resolvers['/api/campaigns/c1']).toBeTruthy());
    rerender({ id: 'c2' });
    await waitFor(() => expect(resolvers['/api/campaigns/c2']).toBeTruthy());
    resolvers['/api/campaigns/c2']({ campaign: { id: 'c2' } });
    await waitFor(() => expect(result.current.detail?.campaign.id).toBe('c2'));
    resolvers['/api/campaigns/c1']({ campaign: { id: 'c1' } });
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.detail?.campaign.id).toBe('c2');
  });
});
