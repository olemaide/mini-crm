-- Extensions used across the CRM.
--
--   citext    case-insensitive text — emails and company domains compare
--             correctly without scattering lower() through every query
--   pg_trgm   trigram similarity — powers fuzzy duplicate detection (Phase 3)
--             and global search (Phase 7)
--   unaccent  strips diacritics, so searching "muller" finds "Müller"
--   pgcrypto  gen_random_uuid() for primary keys

create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pgcrypto with schema extensions;
