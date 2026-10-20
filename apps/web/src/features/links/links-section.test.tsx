import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LinksSection } from './links-section';
import { normalizeUrl } from './link-api';
import { deferred, projectId, response } from '../../../test/photo-fixtures';
const link = { id: 'link-1', projectId, type: 'link' as const, name: 'Site survey', url: 'https://example.com/Survey?A=b#Part', createdAt: '2026-10-20T00:00:00Z' };
const fetchMock = jest.fn<typeof fetch>();
const originalFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = fetchMock; fetchMock.mockReset(); });
afterEach(() => { globalThis.fetch = originalFetch; });
function setup(links = [link]) {
  return render(<QueryClientProvider client={new QueryClient()}><LinksSection projectId={projectId} initialLinks={links} /></QueryClientProvider>);
}
async function fill() {
  await userEvent.click(screen.getByRole('button', { name: '+ Add link' }));
  await userEvent.type(screen.getByLabelText('URL'), 'https://example.com/Survey?A=b#Part');
}
const listResponse = (links: object[]) => response(200, { project: { id: projectId }, assets: links });
describe('project links', () => {
  it('uses server initial links without a duplicate GET and opens a safe external target', () => {
    setup();
    const anchor = screen.getByRole('link', { name: /Site survey/ });
    expect(anchor).toHaveAttribute('href', link.url);
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['javascript:alert(1)', '/relative', 'https://user:secret@example.com'])('rejects invalid URLs before sending: %s', url => {
    expect(() => normalizeUrl(url)).toThrow();
  });
  it('shows validation next to the form and retains input', async () => {
    setup([]);
    await userEvent.click(screen.getByRole('button', { name: '+ Add link' }));
    await userEvent.type(screen.getByLabelText('URL'), 'ftp://example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }));
    expect(screen.getByRole('alert')).toHaveTextContent('HTTP or HTTPS');
    expect(screen.getByLabelText('URL')).toHaveValue('ftp://example.com');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('prevents repeat submission while pending and inserts only a confirmed server record', async () => {
    const pending = deferred<Response>(); fetchMock.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(listResponse([link]));
    setup([]); await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }));
    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await act(async () => { pending.resolve(response(201, link)); });
    await screen.findByText('Link added.');
    expect(screen.getByRole('link', { name: /Site survey/ })).toHaveAttribute('href', link.url);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('preserves input on a definite rejection and allows correction', async () => {
    fetchMock.mockResolvedValueOnce(response(400)); setup([]); await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }));
    await screen.findByText(/Check the URL and name/);
    expect(screen.getByLabelText('URL')).toHaveValue(link.url);
    expect(screen.getByRole('button', { name: 'Add link' })).toBeEnabled();
  });
  it('requires reconciliation after an unknown creation and does not replay POST', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network lost')).mockResolvedValueOnce(listResponse([link]));
    setup([]); await fill(); await userEvent.click(screen.getByRole('button', { name: 'Add link' }));
    await screen.findByText(/result could not be confirmed/);
    expect(screen.getByRole('button', { name: 'Add link' })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Refresh links' }));
    await screen.findByText(/Links refreshed/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('link', { name: /Site survey/ })).toBeVisible();
  });
  it('keeps the card until deletion is confirmed and preserves it after unknown failure', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const pending = deferred<Response>(); fetchMock.mockReturnValueOnce(pending.promise);
    setup(); await userEvent.click(screen.getByRole('button', { name: 'Delete link Site survey' }));
    expect(screen.getByRole('link', { name: /Site survey/ })).toBeVisible();
    await act(async () => { pending.resolve(response(503)); });
    await screen.findByText(/result could not be confirmed/);
    expect(screen.getByRole('link', { name: /Site survey/ })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete link Site survey' })).toBeDisabled();
  });
  it('does not restore a confirmed deletion when refresh fails', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    fetchMock.mockResolvedValueOnce(response(204)).mockResolvedValueOnce(response(503));
    setup(); await userEvent.click(screen.getByRole('button', { name: 'Delete link Site survey' }));
    await waitFor(() => expect(screen.queryByRole('link')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Refresh links' })).toBeEnabled();
  });
});
