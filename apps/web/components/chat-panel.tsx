'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Icon } from '@/components/icons';
import { buttonStyles } from '@/components/ui/button';
import { FieldError, textareaStyles } from '@/components/ui/field';
import { createClient } from '@/lib/supabase/client';

export interface ChatMessage {
  id: number;
  sender_id: string;
  body: string;
  created_at: string;
}

/** Inquiry chat. New messages from either side arrive live through Supabase Realtime (RLS applies). */
export function ChatPanel({
  inquiryId,
  currentUserId,
  otherName,
  initialMessages,
}: {
  inquiryId: string;
  currentUserId: string;
  otherName: string;
  initialMessages: ChatMessage[];
}) {
  const t = useTranslations('Chat');
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputId = useId();
  const listRef = useRef<HTMLOListElement>(null);

  const add = (message: ChatMessage) =>
    setMessages((current) =>
      current.some((m) => m.id === message.id)
        ? current
        : [...current, message].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id),
    );

  useEffect(() => {
    let cancelled = false;
    const channel = supabase
      .channel(`inquiry:${inquiryId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `inquiry_id=eq.${inquiryId}` }, (payload) =>
        add(payload.new as ChatMessage),
      )
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;
        // Realtime only delivers what arrives after the subscription is live, so fetch anything
        // sent between the page loading and now (and after a dropped connection comes back).
        const { data } = await supabase
          .from('messages')
          .select('id, sender_id, body, created_at')
          .eq('inquiry_id', inquiryId)
          .order('created_at');
        if (!cancelled) data?.forEach(add);
      });
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [supabase, inquiryId]);

  // Keep the newest message in view without scrolling the whole page.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setFailed(false);
    const { data, error } = await supabase
      .from('messages')
      .insert({ inquiry_id: inquiryId, body })
      .select('id, sender_id, body, created_at')
      .single();
    setSending(false);
    if (error || !data) {
      setFailed(true);
      return;
    }
    add(data);
    setDraft('');
  }

  return (
    <section aria-labelledby="chat-heading" className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
          <Icon name="message" className="size-4.5" />
        </span>
        <h2 id="chat-heading" className="text-lg font-semibold">
          {t('title', { name: otherName })}
        </h2>
      </div>
      <ol ref={listRef} aria-live="polite" className="flex max-h-[28rem] min-h-64 flex-col gap-3 overflow-y-auto bg-subtle/70 px-4 py-5 sm:px-5">
        {messages.length === 0 && <li className="m-auto max-w-xs text-center text-sm leading-relaxed text-muted">{t('empty')}</li>}
        {messages.map((message) => {
          const mine = message.sender_id === currentUserId;
          return (
            <li key={message.id} className={`flex animate-enter flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
              <span className="px-1 text-xs font-medium text-muted">{mine ? t('you') : otherName}</span>
              <p
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[0.9375rem] leading-relaxed whitespace-pre-wrap shadow-sm ${
                  mine ? 'rounded-ee-md bg-accent text-on-accent' : 'rounded-es-md border border-line bg-surface text-ink'
                }`}
              >
                {message.body}
              </p>
            </li>
          );
        })}
      </ol>
      <form onSubmit={send} className="flex items-end gap-2 border-t border-line p-3 sm:p-4">
        <label htmlFor={inputId} className="sr-only">
          {t('label')}
        </label>
        <textarea
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={2000}
          rows={2}
          placeholder={t('placeholder')}
          className={`${textareaStyles} min-h-12 flex-1 resize-none`}
        />
        <button type="submit" disabled={sending || !draft.trim()} className={buttonStyles({ className: 'min-h-12 shrink-0' })}>
          <Icon name="arrowRight" className="size-4" />
          {sending ? t('sending') : t('send')}
        </button>
      </form>
      {failed && (
        <div className="px-4 pb-3">
          <FieldError>{t('failed')}</FieldError>
        </div>
      )}
    </section>
  );
}
