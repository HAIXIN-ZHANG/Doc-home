'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { css } from '../../../styled-system/css';
import { assetsPath, createLink, deleteLink, LinkRequestError, normalizeUrl, parseProjectLinks } from './link-api';
import type { LinkAsset } from './link-api';

type Action = { kind: 'add'; url: string; name: string } | { kind: 'delete'; link: LinkAsset };
const inputStyle = css({ w: 'full', minW: '0', minH: '11', px: '3', py: '2', borderWidth: '1px', borderColor: 'border', rounded: 'lg',
  _focusVisible: { outline: '2px solid', outlineColor: 'focus.ring', outlineOffset: '2px' } });
export function LinksSection({ projectId, initialLinks = [] }: { projectId: string; initialLinks?: LinkAsset[] }) {
  const client = useQueryClient();
  const queryKey = ['project-links', projectId];
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const query = useQuery({ queryKey, initialData: initialLinks, retry: false, refetchOnMount: false, refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api${assetsPath(projectId)}`, { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) });
      if (!response.ok) throw new Error('Links could not be refreshed');
      return parseProjectLinks(await response.json(), projectId);
    } });
  const mutation = useMutation({ retry: false, mutationFn: async (action: Action) => {
    await client.cancelQueries({ queryKey });
    if (action.kind === 'add') {
      const saved = await createLink(projectId, action.url, action.name);
      client.setQueryData<LinkAsset[]>(queryKey, current => [saved, ...(current ?? [])]);
    } else {
      await deleteLink(projectId, action.link.id);
      client.setQueryData<LinkAsset[]>(queryKey, current => current?.filter(item => item.id !== action.link.id) ?? []);
    }
    try { await query.refetch({ throwOnError: true }); return true; } catch { return false; }
  } });
  const busy = mutation.isPending || query.isFetching;
  async function perform(action: Action) {
    if (busy || needsRefresh) return;
    setFeedback(null);
    try {
      const refreshed = await mutation.mutateAsync(action);
      if (action.kind === 'add') { setOpen(false); setName(''); setUrl(''); }
      setNeedsRefresh(!refreshed);
      setFeedback({ error: !refreshed, message: refreshed ? (action.kind === 'add' ? 'Link added.' : 'Link deleted.')
        : 'Link saved or deleted, but the list could not be refreshed. Refresh links before another action.' });
    } catch (error) {
      setNeedsRefresh(error instanceof LinkRequestError ? error.uncertain : true);
      setFeedback({ error: true, message: error instanceof Error ? error.message : 'Refresh links before trying again.' });
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const checked = normalizeUrl(url);
      if (name.trim().length > 120) throw new Error('Keep the link name within 120 characters.');
      void perform({ kind: 'add', url: checked, name });
    } catch (error) { setFeedback({ error: true, message: error instanceof Error ? error.message : 'Check the URL.' }); }
  }
  async function refresh() {
    if (busy) return;
    try { await query.refetch({ throwOnError: true }); setNeedsRefresh(false); setFeedback({ error: false, message: 'Links refreshed. Check the list before trying again.' }); }
    catch { setFeedback({ error: true, message: 'Links could not be refreshed. Try again.' }); }
  }
  return <section aria-labelledby="links-heading" className={css({ bg: 'bg.surface', borderWidth: '1px', borderColor: 'border', rounded: 'xl', p: { mobile: '4', tablet: '6' }, display: 'flex', flexDirection: 'column', gap: '4', minW: '0' })}>
    <div className={css({ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '3' })}>
      <h2 id="links-heading" className={css({ textStyle: 'heading' })}>Links <span className={css({ textStyle: 'small', color: 'fg.muted' })}>({query.data.length})</span></h2>
      <Button visual="secondary" disabled={busy || needsRefresh || open} onClick={() => { setOpen(true); setFeedback(null); }}>+ Add link</Button>
    </div>
    <p className={css({ textStyle: 'small', color: 'fg.muted' })}>Useful references for this project. Links open in a new tab.</p>
    {open ? <form aria-label="Add project link" noValidate onSubmit={submit} className={css({ display: 'flex', flexDirection: 'column', gap: '3', minW: '0' })}>
      <label className={css({ textStyle: 'label' })}>Name (optional)<input autoFocus className={inputStyle} value={name} maxLength={120} disabled={busy || needsRefresh} onChange={event => setName(event.target.value)} /></label>
      <label className={css({ textStyle: 'label' })}>URL<input type="url" className={inputStyle} value={url} maxLength={2048} required disabled={busy || needsRefresh} placeholder="https://example.com" aria-describedby="link-feedback" onChange={event => setUrl(event.target.value)} /></label>
      <div className={css({ display: 'flex', gap: '3', flexWrap: 'wrap' })}>
        <Button type="submit" disabled={busy || needsRefresh}>{mutation.isPending && mutation.variables?.kind === 'add' ? 'Adding…' : 'Add link'}</Button>
        <Button visual="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form> : null}
    <div id="link-feedback" aria-live="polite">{feedback ? <p role={feedback.error ? 'alert' : 'status'} className={css({ textStyle: 'small', color: feedback.error ? 'status.danger' : 'status.success' })}>{feedback.message}</p> : null}</div>
    {needsRefresh || query.isError ? <Button visual="secondary" disabled={busy} onClick={() => { void refresh(); }}>{query.isFetching ? 'Refreshing links…' : 'Refresh links'}</Button> : null}
    {query.data.length ? <ul aria-label="Project links" className={css({ display: 'flex', flexDirection: 'column', gap: '3', minW: '0' })}>
      {query.data.map(link => <li key={link.id} className={css({ bg: 'bg.canvas', rounded: 'lg', p: '3', display: 'flex', gap: '3', alignItems: 'center', minW: '0' })}>
        <a href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`${link.name} (opens in a new tab)`} className={css({ flex: '1', minW: '0', overflowWrap: 'anywhere', color: 'action.primary', rounded: 'sm', _focusVisible: { outline: '2px solid', outlineColor: 'focus.ring' } })}>
          <span className={css({ fontWeight: 'semibold' })}>↗ {link.name}</span>
          {link.name !== link.url ? <span className={css({ display: 'block', textStyle: 'small', color: 'fg.muted' })}>{link.url}</span> : null}
        </a>
        <Button visual="danger" disabled={busy || needsRefresh} aria-label={`Delete link ${link.name}`} onClick={() => {
          if (window.confirm(`Delete "${link.name}"? It will be removed from this project.`)) void perform({ kind: 'delete', link });
        }}>{mutation.isPending && mutation.variables?.kind === 'delete' && mutation.variables.link.id === link.id ? 'Deleting…' : 'Delete'}</Button>
      </li>)}
    </ul> : <p className={css({ textStyle: 'small', color: 'fg.muted' })}>No links yet. Add a project reference.</p>}
  </section>;
}
