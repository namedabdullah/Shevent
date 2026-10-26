'use client';

import { createApiClient } from '@shevent/core/api';
import { EVENT_TYPE_LABELS } from '@shevent/core/enums';
import { REQUIRED_PLAN_FIELDS, type ExtractedPlan } from '@shevent/core/fixtures';
import { formatEventDate, formatPkrCompact } from '@shevent/core/format';
import type { AssistantChatResponse, ChatMessage } from '@shevent/core/schemas';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { BudgetSplit } from '@/components/budget-split';
import { Icon } from '@/components/icons';
import { SampleDataNotice } from '@/components/sample-data-notice';
import { SubmitButton } from '@/components/submit-button';
import { Link } from '@/i18n/navigation';

// The browser goes through the /api/ai proxy; with fixtures on it answers from packages/core.
const api = createApiClient({ baseUrl: '/api/ai', fixtures: process.env.NEXT_PUBLIC_API_FIXTURES === 'true' });

/** The API takes the last 40 messages; older ones add little and would be refused. */
const HISTORY_LIMIT = 40;
const MAX_LENGTH = 4000;
const URDU_SCRIPT = /[؀-ۿ]/;

type Turn = ChatMessage & { response?: AssistantChatResponse };

/** The planner form's URL with everything the assistant understood filled in. */
function plannerHref(plan: ExtractedPlan) {
  const query: Record<string, string> = {};
  if (plan.event_type) query.event_type = plan.event_type;
  if (plan.guest_count) query.guests = String(plan.guest_count);
  if (plan.area) query.area = plan.area;
  if (plan.venue_type) query.venue_type = plan.venue_type;
  if (plan.event_date) query.date = plan.event_date;
  if (plan.total_budget_pkr) query.budget = String(plan.total_budget_pkr);
  return { pathname: '/plan/new' as const, query };
}

/** Urdu text gets the right language and direction; English and Roman Urdu stay left to right. */
const textProps = (text: string) => (URDU_SCRIPT.test(text) ? { lang: 'ur', dir: 'auto' as const } : { dir: 'auto' as const });

/**
 * #8 chat planner. The assistant only talks and extracts; the split it shows is the #1/#2
 * estimate, and saving goes through the normal planner form so the host checks every value.
 */
export function AssistantChat() {
  const t = useTranslations('Assistant');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const id = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const examples = t.raw('examples') as string[];
  const latest = [...turns].reverse().find((turn) => turn.response)?.response;

  // Keep the newest message in view.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [turns, pending]);

  async function send(text: string) {
    const content = text.trim().slice(0, MAX_LENGTH);
    if (!content || pending) return;
    const history: Turn[] = [...turns, { role: 'user', content }];
    setTurns(history);
    if (inputRef.current) inputRef.current.value = '';
    setFailed(false);
    setPending(true);
    try {
      const messages = history.slice(-HISTORY_LIMIT).map(({ role, content }) => ({ role, content }));
      const response = await api.assistantChat({ messages });
      setTurns([...history, { role: 'assistant', content: response.reply, response }]);
    } catch (error) {
      console.error('Assistant failed', error);
      setFailed(true);
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  // The box is read directly rather than mirrored in state, so text typed before the page finished
  // loading is still sent.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(inputRef.current?.value ?? '');
  }

  // Enter sends, Shift+Enter adds a line (and Enter while composing Urdu input is left alone).
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(event.currentTarget.value);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SampleDataNotice response={latest} />

      <ol
        ref={listRef}
        aria-label={t('conversation')}
        aria-live="polite"
        className="flex max-h-[min(36rem,65dvh)] min-h-72 flex-col gap-4 overflow-y-auto rounded-2xl border border-sand-200 bg-white p-4 sm:p-5"
      >
        <li className="flex flex-col items-start gap-1">
          <span className="text-xs text-sand-600">{t('assistant')}</span>
          <p className="max-w-[90%] rounded-2xl rounded-ss-sm bg-sand-100 px-4 py-2.5 text-sand-900">{t('greeting')}</p>
        </li>
        {turns.map((turn, index) => {
          const mine = turn.role === 'user';
          return (
            <li key={index} className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
              <span className="text-xs text-sand-600">{mine ? t('you') : t('assistant')}</span>
              <p
                {...textProps(turn.content)}
                className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 ${mine ? 'rounded-se-sm bg-brand-700 text-white' : 'rounded-ss-sm bg-sand-100 text-sand-900'}`}
              >
                {turn.content}
              </p>
              {turn.response && <ResponseDetails response={turn.response} />}
            </li>
          );
        })}
        {pending && (
          <li className="flex flex-col items-start gap-1">
            <span className="text-xs text-sand-600">{t('assistant')}</span>
            <p className="rounded-2xl rounded-ss-sm bg-sand-100 px-4 py-2.5 text-sand-600">{t('thinking')}</p>
          </li>
        )}
      </ol>

      {turns.length === 0 && (
        <div className="flex flex-col gap-2">
          <p id={`${id}-examples`} className="text-sm font-medium text-sand-700">
            {t('examplesTitle')}
          </p>
          <ul aria-labelledby={`${id}-examples`} className="flex flex-wrap gap-2">
            {examples.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  onClick={() => void send(example)}
                  disabled={pending}
                  {...textProps(example)}
                  className="min-h-11 rounded-full border border-sand-300 bg-white px-4 py-2 text-start text-sm text-sand-800 transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:opacity-60"
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor={`${id}-input`} className="text-sm font-medium">
          {t('inputLabel')}
        </label>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            id={`${id}-input`}
            rows={2}
            maxLength={MAX_LENGTH}
            onKeyDown={onKeyDown}
            placeholder={t('placeholder')}
            dir="auto"
            aria-describedby={`${id}-hint`}
            className="min-h-12 flex-1 resize-y rounded-xl border border-sand-400 bg-white px-3 py-2.5 text-base text-sand-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          />
          <SubmitButton
            pending={pending}
            className="min-h-12 rounded-xl bg-brand-700 px-5 font-semibold text-white transition-colors hover:bg-brand-800 disabled:opacity-60"
          >
            {t('send')}
          </SubmitButton>
        </div>
        <p id={`${id}-hint`} className="text-sm text-sand-600">
          {t('inputHint')}
        </p>
        {failed && (
          <p role="alert" className="text-sm text-red-700">
            {t('failed')}{' '}
            <Link href={plannerHref(latest?.extracted ?? {})} className="font-medium underline underline-offset-4">
              {t('useForm')}
            </Link>
          </p>
        )}
      </form>

      <p className="text-sm text-sand-600">
        {t('preferForm')}{' '}
        <Link href={plannerHref(latest?.extracted ?? {})} className="font-medium text-brand-700 underline underline-offset-4">
          {t('useForm')}
        </Link>
      </p>
    </div>
  );
}

/** Under a reply: what was understood so far, then the split (or the hand-over to the form). */
function ResponseDetails({ response }: { response: AssistantChatResponse }) {
  const t = useTranslations('Assistant');
  const plan = response.extracted;
  const value = (field: (typeof REQUIRED_PLAN_FIELDS)[number]) => {
    switch (field) {
      case 'event_type':
        return plan.event_type && EVENT_TYPE_LABELS[plan.event_type];
      case 'guest_count':
        return plan.guest_count && t('guests', { count: plan.guest_count });
      case 'area':
        return plan.area;
      case 'event_date':
        return plan.event_date && formatEventDate(plan.event_date);
      case 'total_budget_pkr':
        return plan.total_budget_pkr && formatPkrCompact(plan.total_budget_pkr);
    }
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <dl aria-label={t('understood')} className="flex flex-wrap gap-1.5 text-xs">
        {REQUIRED_PLAN_FIELDS.map((field) => {
          const known = value(field);
          return (
            <div
              key={field}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 ${known ? 'border-sand-200 bg-white text-sand-800' : 'border-dashed border-sand-400 text-sand-600'}`}
            >
              <dt className="font-medium">{t(`fields.${field}`)}:</dt>
              <dd>{known || t('needed')}</dd>
            </div>
          );
        })}
      </dl>

      {response.estimate && (
        <div className="flex flex-col gap-4 rounded-2xl border border-sand-200 bg-cream p-4">
          <BudgetSplit estimate={response.estimate} />
          <div className="flex flex-col items-start gap-1">
            <Link
              href={plannerHref(plan)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-700 px-5 font-semibold text-white transition-colors hover:bg-brand-800"
            >
              {t('savePlan')}
              <Icon name="arrowRight" className="size-4" />
            </Link>
            <p className="text-sm text-sand-600">{t('savePlanHint')}</p>
          </div>
        </div>
      )}

      {response.fallback_to_form && (
        <div className="flex flex-col items-start gap-2 rounded-2xl border border-gold-200 bg-gold-50 p-4">
          <p className="text-sm text-sand-800">{t('fallback')}</p>
          <Link
            href={plannerHref(plan)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-700 px-5 font-semibold text-white transition-colors hover:bg-brand-800"
          >
            {t('openForm')}
            <Icon name="arrowRight" className="size-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
