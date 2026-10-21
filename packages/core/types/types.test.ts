// Type-level contract checks, enforced by `pnpm typecheck`: the database enums (generated from the
// Supabase schema) must match the shared enums, so a migration can't silently drift from the apps.
import { describe, expectTypeOf, it } from 'vitest';
import type { Area, Category, EventType, PriceTier, PriceUnit, VenueType } from '../enums';
import type { FairnessLevel } from '../labels';
import type { LeadType } from '../schemas';
import type { Database } from './supabase';

type DbEnum<Name extends keyof Database['public']['Enums']> = Database['public']['Enums'][Name];

describe('database enums match packages/core', () => {
  it('match', () => {
    expectTypeOf<DbEnum<'lahore_area'>>().toEqualTypeOf<Area>();
    expectTypeOf<DbEnum<'service_category'>>().toEqualTypeOf<Category>();
    expectTypeOf<DbEnum<'event_type'>>().toEqualTypeOf<EventType>();
    expectTypeOf<DbEnum<'venue_type'>>().toEqualTypeOf<VenueType>();
    expectTypeOf<DbEnum<'price_tier'>>().toEqualTypeOf<PriceTier>();
    expectTypeOf<DbEnum<'price_unit'>>().toEqualTypeOf<PriceUnit>();
    expectTypeOf<DbEnum<'lead_type'>>().toEqualTypeOf<LeadType>();
    expectTypeOf<FairnessLevel>().toEqualTypeOf<'green' | 'yellow' | 'red'>();
  });
});
