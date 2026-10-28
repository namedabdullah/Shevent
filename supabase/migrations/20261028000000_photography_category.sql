-- Photographers and videographers become the sixth service category (data/reference/categories.csv).
-- Vendor listings, vendor-join leads and sponsored placements all use this enum, so they accept it at once.
-- A new enum value can't be used in the transaction that adds it, so this migration only adds it.

alter type public.service_category add value if not exists 'photography';
