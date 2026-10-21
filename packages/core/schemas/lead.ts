// Waitlist and vendor-join forms → Supabase `leads` table (WEB_APP_PLAN §5.3, §6).
// Length limits match the check constraints in supabase/migrations.

import { z } from 'zod';
import { AREAS, CATEGORIES } from '../enums';

export const LEAD_TYPES = ['waitlist', 'vendor_join'] as const;
export type LeadType = (typeof LEAD_TYPES)[number];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pakistani or international phone/WhatsApp number: 10–13 digits, optional leading +. */
function isPhone(value: string): boolean {
  if (!/^\+?[\d\s-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 13;
}

export const contactSchema = z
  .string()
  .trim()
  .max(200)
  .refine((value) => EMAIL.test(value) || isPhone(value), { message: 'Enter an email address or a phone number' });

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const leadSchema = z
  .object({
    type: z.enum(LEAD_TYPES),
    name: optionalText(100),
    contact: contactSchema,
    category: z.enum(CATEGORIES).optional(),
    area: z.enum(AREAS).optional(),
    utm_source: optionalText(100),
    utm_medium: optionalText(100),
    utm_campaign: optionalText(100),
    referrer: optionalText(500),
    landing_path: optionalText(300),
  })
  .superRefine((lead, ctx) => {
    if (lead.type !== 'vendor_join') return;
    if (!lead.name) ctx.addIssue({ code: 'custom', path: ['name'], message: 'Enter your business name' });
    if (!lead.category) ctx.addIssue({ code: 'custom', path: ['category'], message: 'Choose your service category' });
  });
export type Lead = z.infer<typeof leadSchema>;
