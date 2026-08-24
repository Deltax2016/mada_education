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
  -- Must produce exactly what core/i18n.py ar_normalize produces. If the two
  -- ever disagree, search and answer grading disagree with each other, and the
  -- symptom is a correct answer marked wrong for no visible reason.
  --
  -- Order matters: diacritics and tatweel are deleted first, then letter shapes
  -- are folded. Tatweel is deleted, never mapped to a space, or a stretched word
  -- would normalise into two.
  SELECT lower(
           translate(
             regexp_replace(
               replace(regexp_replace(t, '[ً-ْٰ]', '', 'g'), 'ـ', ''),
               '[‌-‏؜]', '', 'g'
             ),
             'أإآٱىئةؤ٠١٢٣٤٥٦٧٨٩',
             'اااايي' || 'هو' || '0123456789'
           )
         )
$$;
