import { describe, expect, it } from 'vitest';
import { assistantChatResponseSchema, type ChatMessage } from '../schemas';
import { detectLanguage, extractPlanParams, missingPlanFields } from './assistant';
import { fixtureAssistantChat, fixtureEstimate } from './index';

const TODAY = '2026-10-26';
const user = (content: string): ChatMessage => ({ role: 'user', content });
const assistant = (content: string): ChatMessage => ({ role: 'assistant', content });

describe('extractPlanParams', () => {
  it('reads the README example in English', () => {
    expect(extractPlanParams('I need a mehndi for 300 people in Gulberg in December 19, around 25 lakh', TODAY)).toEqual({
      event_type: 'wedding_mehndi',
      guest_count: 300,
      area: 'Gulberg',
      event_date: '2026-12-19',
      total_budget_pkr: 2_500_000,
    });
  });

  it('reads Roman Urdu and area aliases', () => {
    expect(extractPlanParams('walima karni hai 500 log, DHA phase 5 mein, budget 40 lakh, 2 jan', TODAY)).toEqual({
      event_type: 'wedding_walima',
      guest_count: 500,
      area: 'DHA',
      event_date: '2027-01-02',
      total_budget_pkr: 4_000_000,
    });
  });

  it('reads Urdu script, Urdu digits and Urdu money words', () => {
    expect(extractPlanParams('گلبرگ میں ۳۰۰ مہمانوں کی مہندی، بجٹ 25 لاکھ، 19 دسمبر', TODAY)).toEqual({
      event_type: 'wedding_mehndi',
      guest_count: 300,
      area: 'Gulberg',
      event_date: '2026-12-19',
      total_budget_pkr: 2_500_000,
    });
  });

  it('reads budgets written in several ways', () => {
    expect(extractPlanParams('budget is 2500000', TODAY).total_budget_pkr).toBe(2_500_000);
    expect(extractPlanParams('Rs 1,800,000 max', TODAY).total_budget_pkr).toBe(1_800_000);
    expect(extractPlanParams('around 1.5 crore', TODAY).total_budget_pkr).toBe(15_000_000);
    expect(extractPlanParams('850k', TODAY).total_budget_pkr).toBe(850_000);
  });

  it('reads dates written in several ways, and a date without a year is the next one', () => {
    expect(extractPlanParams('19/12/2026', TODAY).event_date).toBe('2026-12-19');
    expect(extractPlanParams('on the 5th of March', TODAY).event_date).toBe('2027-03-05');
    expect(extractPlanParams('2026-11-20', TODAY).event_date).toBe('2026-11-20');
    expect(extractPlanParams('300 log, gulberg 19 december', TODAY).event_date).toBe('2026-12-19');
  });

  it('leaves unclear or impossible values missing instead of guessing', () => {
    expect(extractPlanParams('a wedding sometime soon', TODAY)).toEqual({});
    expect(extractPlanParams('19 December 2025', TODAY).event_date).toBeUndefined();
    expect(extractPlanParams('31 February', TODAY).event_date).toBeUndefined();
    expect(extractPlanParams('5 guests', TODAY).guest_count).toBeUndefined();
    // A guest count is never read as money, and money needs a unit or a "budget"/"Rs" word.
    expect(extractPlanParams('300 guests', TODAY).total_budget_pkr).toBeUndefined();
  });

  it('prefers the specific event type and the longest area name', () => {
    expect(extractPlanParams('corporate dinner for 200 people', TODAY).event_type).toBe('corporate_dinner');
    expect(extractPlanParams('company conference', TODAY).event_type).toBe('corporate_other');
    expect(extractPlanParams('Model Town Extension', TODAY).area).toBe('Model Town');
    expect(extractPlanParams('a farmhouse in Bahria Town', TODAY)).toMatchObject({ area: 'Bahria Town', venue_type: 'farmhouse' });
  });
});

describe('detectLanguage', () => {
  it('tells English, Roman Urdu, Urdu and mixed apart', () => {
    expect(detectLanguage('A mehndi for 300 people')).toBe('en');
    expect(detectLanguage('mehndi karni hai 300 log')).toBe('roman_ur');
    expect(detectLanguage('گلبرگ میں مہندی')).toBe('ur');
    expect(detectLanguage('گلبرگ میں mehndi function')).toBe('mixed');
  });
});

describe('fixtureAssistantChat', () => {
  it('asks for what is missing, then estimates once the plan is complete', () => {
    const first = fixtureAssistantChat({ messages: [user('mehndi for 300 people in Gulberg')] }, TODAY);
    expect(assistantChatResponseSchema.safeParse(first).success).toBe(true);
    expect(first.missing).toEqual(['event_date', 'total_budget_pkr']);
    expect(first.estimate).toBeNull();
    expect(first.reply).toContain('the date and your total budget');

    const second = fixtureAssistantChat(
      { messages: [user('mehndi for 300 people in Gulberg'), assistant(first.reply), user('19 December, 25 lakh')] },
      TODAY,
    );
    expect(second.missing).toEqual([]);
    expect(second.extracted).toMatchObject({ event_date: '2026-12-19', total_budget_pkr: 2_500_000 });
    expect(second.estimate).toEqual(fixtureEstimate({ event_type: 'wedding_mehndi', guest_count: 300, area: 'Gulberg', event_date: '2026-12-19', total_budget_pkr: 2_500_000 }));
    expect(second.fallback_to_form).toBe(false);
  });

  it('never states a number that is not from the host or the estimate', () => {
    const chat = fixtureAssistantChat({ messages: [user('walima 500 log DHA 2 jan budget 40 lakh')] }, TODAY);
    const allowed = new Set([
      '500',
      '2',
      '2027',
      '40',
      ...Object.values(chat.estimate!.allocation).map((item) => String(item.pkr / 100_000).replace(/\.0+$/, '')),
    ]);
    for (const number of chat.reply.match(/\d+(?:\.\d+)?/g) ?? []) expect(allowed, number).toContain(number);
  });

  it('later messages override earlier ones', () => {
    const chat = fixtureAssistantChat({ messages: [user('300 guests'), user('actually 450 guests')] }, TODAY);
    expect(chat.extracted.guest_count).toBe(450);
  });

  it('hands over to the form after three messages it cannot read', () => {
    const messages = [user('hello'), assistant('…'), user('not sure yet'), assistant('…'), user('hmm')];
    expect(fixtureAssistantChat({ messages }, TODAY).fallback_to_form).toBe(true);
    expect(fixtureAssistantChat({ messages: messages.slice(0, 3) }, TODAY).fallback_to_form).toBe(false);
  });

  it('shows an example when it understood nothing yet', () => {
    expect(missingPlanFields({})).toHaveLength(5);
    expect(fixtureAssistantChat({ messages: [user('hi')] }, TODAY).reply).toContain('For example');
  });
});
