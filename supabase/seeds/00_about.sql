-- Extra seed files, run after ../seed.sql by `pnpm db:reset` (config.toml [db.seed]).
-- collected_vendors.sql (git-ignored) puts the collected Lahore vendors in public.vendors. Make it with
--   python -m shevent_ml.data.app_seed
-- This file only keeps the folder, and the seed pattern, from being empty.
select 1;
