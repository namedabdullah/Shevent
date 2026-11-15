'use client';

import { createApiClient } from '@shevent/core/api';
import type { PortfolioCheckResponse } from '@shevent/core/schemas';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState, type ChangeEvent, type FormEvent } from 'react';
import { Icon } from '@/components/icons';
import { SampleDataNotice } from '@/components/sample-data-notice';
import { buttonStyles } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';

// The browser goes through the /api/ai proxy; with fixtures on it answers from packages/core.
const api = createApiClient({ baseUrl: '/api/ai', fixtures: process.env.NEXT_PUBLIC_API_FIXTURES === 'true', fixtureDelayMs: 0 });

const MAX_BYTES = 10_000_000; // the model server's limit
const ACCEPT = 'image/jpeg,image/png,image/webp';
const SHOWN_TAGS = 5;

type State =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'done'; result: PortfolioCheckResponse }
  | { status: 'error'; message: string };

/**
 * #7 Verified Portfolios for the vendor's own listing: check one photo before using it, for its
 * style tags and whether it copies a photo already on another listing. Nothing is stored; the
 * listing has no photo uploads yet. Wording is guidance, not an accusation.
 */
export function PortfolioCheck({ vendorId }: { vendorId: string }) {
  const t = useTranslations('PortfolioCheck');
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<State>({ status: 'idle' });

  // Free the last preview's object URL when it changes or the panel unmounts.
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    const usable = chosen && chosen.size <= MAX_BYTES ? chosen : null;
    setState(chosen && !usable ? { status: 'error', message: t('tooBig') } : { status: 'idle' });
    setFile(usable);
    setPreview(usable ? URL.createObjectURL(usable) : null);
  }

  async function check(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setState({ status: 'checking' });
    try {
      setState({ status: 'done', result: await api.portfolioCheck(vendorId, file) });
    } catch (error) {
      const status = (error as { status?: number }).status;
      setState({ status: 'error', message: status === 422 || status === 400 ? t('notImage') : t('failed') });
    }
  }

  const result = state.status === 'done' ? state.result : null;
  const duplicate = result?.duplicate.status;

  return (
    <section aria-labelledby={`${inputId}-title`} className="flex w-full max-w-3xl flex-col gap-5 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-1.5">
        <h2 id={`${inputId}-title`} className="flex items-center gap-2 text-xl font-semibold">
          <Icon name="photography" className="size-5 text-accent-ink" />
          {t('title')}
        </h2>
        <p className="max-w-prose text-sm leading-relaxed text-ink-soft">{t('intro')}</p>
      </div>

      <form onSubmit={check} className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <label
          htmlFor={inputId}
          className="relative flex aspect-[4/3] w-full shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-line-strong bg-subtle text-sm text-muted focus-within:ring-2 focus-within:ring-accent sm:w-56"
        >
          {preview ? (
            // A local object URL of the chosen file: next/image can't optimise it.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={t('previewAlt')} className="size-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1.5 p-4 text-center">
              <Icon name="plus" className="size-5" />
              {t('choose')}
            </span>
          )}
          <input id={inputId} name="image" type="file" accept={ACCEPT} onChange={choose} className="sr-only" />
        </label>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={!file || state.status === 'checking'} className={buttonStyles({ size: 'sm' })}>
              {state.status === 'checking' ? t('checking') : t('check')}
            </button>
            {file && <span className="truncate text-sm text-muted">{file.name}</span>}
          </div>

          <div aria-live="polite" className="flex flex-col gap-4">
            {state.status === 'error' && (
              <Notice tone="error" role="alert">
                {state.message}
              </Notice>
            )}
            {result && (
              <>
                <SampleDataNotice response={result} />
                {duplicate === 'unique' ? (
                  <Notice tone="success" title={t('uniqueTitle')}>
                    {t('unique')}
                  </Notice>
                ) : (
                  <Notice tone="warning" title={duplicate === 'duplicate' ? t('duplicateTitle') : t('similarTitle')}>
                    {duplicate === 'duplicate' ? t('duplicate') : t('similar')}
                  </Notice>
                )}
                {result.tags.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-semibold">{t('tags')}</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {result.tags.slice(0, SHOWN_TAGS).map((tag) => (
                        <li key={tag.label} className="rounded-full bg-subtle px-2.5 py-1 text-xs font-medium text-ink-soft">
                          {tag.label} <span className="text-muted tabular-nums">{Math.round(tag.score * 100)}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
          <p className="text-xs text-muted">{t('notSaved')}</p>
        </div>
      </form>
    </section>
  );
}
