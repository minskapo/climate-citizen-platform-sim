import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Editor, FILE_TOO_BIG } from './Editor';

vi.mock('../lib/api', () => ({ api: vi.fn(), ApiError: class extends Error {} }));

const setup = (onSubmit = vi.fn(async () => undefined), allowNotice = false) =>
  render(<Editor categories={['공지', '자료', '자유']} allowNotice={allowNotice} onSubmit={onSubmit} />);

describe('Editor', () => {
  test('editor rejects 1.2MB attachment with friendly error', async () => {
    const onSubmit = vi.fn(async () => undefined);
    setup(onSubmit);
    const big = new File([new Uint8Array(1_200_000)], 'big.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('파일 고르기'), { target: { files: [big] } });
    expect(await screen.findByText('파일은 1MB까지 올릴 수 있어요')).toBeInTheDocument();
    expect(FILE_TOO_BIG).toBe('파일은 1MB까지 올릴 수 있어요');
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '제목' } });
    fireEvent.change(screen.getByLabelText('내용'), { target: { value: '내용' } });
    fireEvent.click(screen.getByRole('button', { name: '올리기' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect((onSubmit.mock.calls[0] as unknown as [{ attachments: unknown[] }])[0].attachments).toHaveLength(0);
  });

  test('accepts a small file and sends it as base64', async () => {
    const onSubmit = vi.fn(async () => undefined);
    setup(onSubmit);
    fireEvent.change(screen.getByLabelText('파일 고르기'), { target: { files: [new File(['hello'], 'a.txt', { type: 'text/plain' })] } });
    expect(await screen.findByText('a.txt')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: 't' } });
    fireEvent.change(screen.getByLabelText('내용'), { target: { value: 'b' } });
    await waitFor(() => fireEvent.click(screen.getByRole('button', { name: '올리기' })));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const att = (onSubmit.mock.calls[0] as unknown as [{ attachments: Array<{ dataBase64: string }> }])[0].attachments[0];
    expect(att.dataBase64).toBe(btoa('hello'));
  });

  test('공지 only offered when allowed; empty title is refused', async () => {
    const { unmount } = setup();
    expect(screen.queryByRole('option', { name: '공지' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '올리기' }));
    expect(await screen.findByText('제목을 써 주세요')).toBeInTheDocument();
    unmount();
    setup(undefined, true);
    expect(screen.getByRole('option', { name: '공지' })).toBeInTheDocument();
  });
});
