-- Migration 002: Fix bias rules
-- 1. Remove 'senior' and 'junior' from age_discrimination (seniority ≠ age)
-- 2. Add comprehensive English bias rules missing from initial seed

-- Fix DA age_discrimination: senior/junior refer to experience level, not age
UPDATE bias_rules
SET pattern = 'ung|yngre|frisk|moden|ældre|\+50|nyuddannet', updated_at = NOW()
WHERE category = 'age_discrimination' AND 'da' = ANY(languages);

-- Add missing English rules
INSERT INTO bias_rules (pattern, category, severity, jurisdictions, languages) VALUES
  -- Age
  ('young professional|fresh graduate|recent graduate|youthful candidate|new grad',
   'age_discrimination_en', 'high', ARRAY['dk'], ARRAY['en']),
  -- Direct gender specification
  ('he/she|him/her|male or female|male/female',
   'direct_gender_spec_en', 'high', ARRAY['dk'], ARRAY['en']),
  -- Ethnicity
  ('native english speaker only|must be (american|british|european|western)|european background only',
   'ethnicity_en', 'high', ARRAY['dk'], ARRAY['en']),
  -- Family / civil status
  ('without family (obligations|commitments)|no family (obligations|commitments)|single candidate',
   'family_status_en', 'high', ARRAY['dk'], ARRAY['en']),
  -- Disability
  ('must be (physically )?healthy|no physical limitations|fully able-bodied|no disabilities|physically strong and healthy',
   'disability_en', 'high', ARRAY['dk'], ARRAY['en']),
  -- Religion
  ('christian|muslim|jewish|hindu|buddhist',
   'religion_en', 'high', ARRAY['dk'], ARRAY['en']),
  -- Aggressive metaphors
  ('kill it|crush (the )?competition|dominate the market|war machine|battlefield mindset|go to war',
   'aggressive_metaphor_en', 'medium', ARRAY['dk'], ARRAY['en']),
  -- Cultural exclusion
  ('fits? (our|the) (culture|dna)|one of us|part of the family|culture fit only',
   'cultural_exclusion_en', 'medium', ARRAY['dk'], ARRAY['en']),
  -- Education elitism
  ('ivy league|top university|elite university|from the best (schools|universities)|only (from )?(harvard|stanford|mit|oxford|cambridge)',
   'education_elitism_en', 'medium', ARRAY['dk'], ARRAY['en'])
ON CONFLICT DO NOTHING;
