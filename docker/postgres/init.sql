CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS vector;

-- Arabic normalisation for search and for grading short text answers.
-- Users type without diacritics and with whichever alef variant is on their
-- keyboard; comparing raw strings misses most real input.
CREATE OR REPLACE FUNCTION ar_normalize(t text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(
           translate(
             t,
             'أإآٱىئةؤـ٠١٢٣٤٥٦٧٨٩',
             'اااايي' || 'هو' || ' ' || '0123456789'
           ),
           '[ً-ْٰ]', '', 'g')
$$;
