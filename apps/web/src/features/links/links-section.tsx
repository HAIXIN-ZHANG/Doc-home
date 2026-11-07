'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { AssetSection } from '@/components/ui/asset-section';
import { Button } from '@/components/ui/button';
import { InlineFeedback } from '@/components/ui/inline-feedback';
import { TextInput } from '@/components/ui/text-input';

import { css } from '../../../styled-system/css';
import { projectAssetsPath } from '../project-assets/asset-urls';
import {
  createLink,
  deleteLink,
  LinkRequestError,
  normalizeUrl,
  parseProjectLinks,
} from './link-api';
import type { LinkAsset } from './link-api';

type Action = { kind: 'add'; url: string; name: string } | { kind: 'delete'; link: LinkAsset };
export function LinksSection({
  projectId,
  initialLinks = [],
}: {
  projectId: string;
  initialLinks?: LinkAsset[];
}) {
  const queryClient = useQueryClient();
  const queryKey = ['project-links', projectId];
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const linksQuery = useQuery({
    queryKey,
    initialData: initialLinks,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api${projectAssetsPath(projectId)}`, {
        cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      });
      if (!response.ok) throw new Error('Links could not be refreshed');
      return parseProjectLinks(await response.json(), projectId);
    },
  });
  const mutation = useMutation({
    retry: false,
    mutationFn: async (action: Action) => {
      await queryClient.cancelQueries({ queryKey });
      if (action.kind === 'add') {
        const saved = await createLink(projectId, action.url, action.name);
        queryClient.setQueryData<LinkAsset[]>(queryKey, (current) => [saved, ...(current ?? [])]);
      } else {
        await deleteLink(projectId, action.link.id);
        queryClient.setQueryData<LinkAsset[]>(
          queryKey,
          (current) => current?.filter((item) => item.id !== action.link.id) ?? [],
        );
      }
      try {
        await linksQuery.refetch({ throwOnError: true });
        return true;
      } catch {
        return false;
      }
    },
  });
  const isBusy = mutation.isPending || linksQuery.isFetching;
  async function perform(action: Action) {
    if (isBusy || needsRefresh) return;
    setFeedback(null);
    try {
      const refreshed = await mutation.mutateAsync(action);
      if (action.kind === 'add') {
        setIsFormOpen(false);
        setName('');
        setUrl('');
      }
      setNeedsRefresh(!refreshed);
      setFeedback({
        error: !refreshed,
        message: refreshed
          ? action.kind === 'add'
            ? 'Link added.'
            : 'Link deleted.'
          : 'Link saved or deleted, but the list could not be refreshed. Refresh links before another action.',
      });
    } catch (error) {
      setNeedsRefresh(error instanceof LinkRequestError ? error.uncertain : true);
      setFeedback({
        error: true,
        message: error instanceof Error ? error.message : 'Refresh links before trying again.',
      });
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const checked = normalizeUrl(url);
      if (name.trim().length > 120) throw new Error('Keep the link name within 120 characters.');
      void perform({ kind: 'add', url: checked, name });
    } catch (error) {
      setFeedback({
        error: true,
        message: error instanceof Error ? error.message : 'Check the URL.',
      });
    }
  }
  async function refresh() {
    if (isBusy) return;
    try {
      await linksQuery.refetch({ throwOnError: true });
      setNeedsRefresh(false);
      setFeedback({
        error: false,
        message: 'Links refreshed. Check the list before trying again.',
      });
    } catch {
      setFeedback({ error: true, message: 'Links could not be refreshed. Try again.' });
    }
  }
  return (
    <AssetSection
      headingId="links-heading"
      title="Links"
      count={linksQuery.data.length}
      description="Useful references for this project. Links open in a new tab."
      action={
        <Button
          visual="secondary"
          disabled={isBusy || needsRefresh || isFormOpen}
          onClick={() => {
            setIsFormOpen(true);
            setFeedback(null);
          }}
        >
          + Add link
        </Button>
      }
    >
      {isFormOpen ? (
        <form
          aria-label="Add project link"
          noValidate
          onSubmit={submit}
          className={css({ display: 'flex', flexDirection: 'column', gap: '3', minW: '0' })}
        >
          <label className={css({ textStyle: 'label' })}>
            Name (optional)
            <TextInput
              autoFocus
              value={name}
              maxLength={120}
              disabled={isBusy || needsRefresh}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className={css({ textStyle: 'label' })}>
            URL
            <TextInput
              type="url"
              value={url}
              maxLength={2048}
              required
              disabled={isBusy || needsRefresh}
              placeholder="https://example.com"
              aria-describedby="link-feedback"
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
          <div className={css({ display: 'flex', gap: '3', flexWrap: 'wrap' })}>
            <Button type="submit" disabled={isBusy || needsRefresh}>
              {mutation.isPending && mutation.variables?.kind === 'add' ? 'Adding…' : 'Add link'}
            </Button>
            <Button visual="secondary" disabled={isBusy} onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      <div id="link-feedback" aria-live="polite">
        {feedback ? (
          <InlineFeedback tone={feedback.error ? 'error' : 'success'}>
            {feedback.message}
          </InlineFeedback>
        ) : null}
      </div>
      {needsRefresh || linksQuery.isError ? (
        <Button
          visual="secondary"
          disabled={isBusy}
          onClick={() => {
            void refresh();
          }}
        >
          {linksQuery.isFetching ? 'Refreshing links…' : 'Refresh links'}
        </Button>
      ) : null}
      {linksQuery.data.length ? (
        <ul
          aria-label="Project links"
          className={css({ display: 'flex', flexDirection: 'column', gap: '3', minW: '0' })}
        >
          {linksQuery.data.map((link) => (
            <li
              key={link.id}
              className={css({
                bg: 'bg.canvas',
                rounded: 'lg',
                p: '3',
                display: 'flex',
                gap: '3',
                alignItems: 'center',
                minW: '0',
              })}
            >
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${link.name} (opens in a new tab)`}
                className={css({
                  flex: '1',
                  minW: '0',
                  overflowWrap: 'anywhere',
                  color: 'action.primary',
                  rounded: 'sm',
                  _focusVisible: { outline: '2px solid', outlineColor: 'focus.ring' },
                })}
              >
                <span className={css({ fontWeight: 'semibold' })}>↗ {link.name}</span>
                {link.name !== link.url ? (
                  <span
                    className={css({ display: 'block', textStyle: 'small', color: 'fg.muted' })}
                  >
                    {link.url}
                  </span>
                ) : null}
              </a>
              <Button
                visual="danger"
                disabled={isBusy || needsRefresh}
                aria-label={`Delete link ${link.name}`}
                onClick={() => {
                  if (
                    window.confirm(`Delete "${link.name}"? It will be removed from this project.`)
                  )
                    void perform({ kind: 'delete', link });
                }}
              >
                {mutation.isPending &&
                mutation.variables?.kind === 'delete' &&
                mutation.variables.link.id === link.id
                  ? 'Deleting…'
                  : 'Delete'}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={css({ textStyle: 'small', color: 'fg.muted' })}>
          No links yet. Add a project reference.
        </p>
      )}
    </AssetSection>
  );
}
