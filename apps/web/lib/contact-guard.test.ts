import { describe, expect, it } from 'vitest';
import { contactBlock, CONTACT_REASONS } from './contact-guard';
import en from '../messages/en.json';

describe('contactBlock', () => {
  it('reads the reason and field from the database error', () => {
    expect(contactBlock({ code: 'SV001', details: 'phone', hint: 'notes' })).toEqual({ reason: 'phone', field: 'notes' });
  });

  it.each([null, undefined, { code: '42501', details: 'phone', hint: 'notes' }, { code: 'SV001', details: 'pigeon', hint: 'notes' }, { code: 'SV001' }])(
    'ignores anything else: %j',
    (error) => expect(contactBlock(error)).toBeNull(),
  );
});

describe('messages', () => {
  it('explain every reason the database can give', () => {
    for (const reason of CONTACT_REASONS) expect(en.ContactGuard.what[reason], reason).toBeTruthy();
  });
});
