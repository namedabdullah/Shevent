'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
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

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest' });
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
    <section aria-labelledby="chat-heading" className="flex flex-col gap-3">
      <h2 id="chat-heading" className="text-xl font-semibold">{t('title', { name: otherName })}</h2>
      <ol ref={listRef} aria-live="polite" className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto rounded-lg border border-zinc-200 p-3">
        {messages.length === 0 && <li className="text-sm text-zinc-600">{t('empty')}</li>}
        {messages.map((message) => {
          const mine = message.sender_id === currentUserId;
          return (
            <li key={message.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <span className="text-xs text-zinc-500">{mine ? t('you') : otherName}</span>
              <p className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${mine ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-900'}`}>
                {message.body}
              </p>
            </li>
          );
        })}
      </ol>
      <form onSubmit={send} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={inputId} className="sr-only">{t('label')}</label>
        <textarea
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={2000}
          rows={2}
          placeholder={t('placeholder')}
          className="min-h-11 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
        />
        <button type="submit" disabled={sending || !draft.trim()} className="min-h-11 rounded-lg bg-zinc-900 px-5 font-medium text-white hover:bg-zinc-700 disabled:opacity-60">
          {sending ? t('sending') : t('send')}
        </button>
      </form>
      {failed && <p role="alert" className="text-sm text-red-700">{t('failed')}</p>}
    </section>
  );
}
