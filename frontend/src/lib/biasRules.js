// Client-side bias rules for inline checking as the user types.
// Patterns mirror the DB seed in backend/src/db/migrations/*.sql.
// Running these in the browser means instant feedback without an API round-trip.
//
// IMPORTANT: When adding/changing rules here, update the DB migration as well
// so the backend bias check stays in sync.

// Unicode-safe word boundary helper for Danish chars (standard \b is ASCII-only).
// Use (?<![a-zA-ZæøåÆØÅ]) before and (?![a-zA-ZæøåÆØÅ]) after a pattern.

const DA = [
  {
    // "senior" and "junior" refer to seniority, NOT age — excluded from this rule.
    pattern: /(?<![a-zA-ZæøåÆØÅ])(ung|yngre|frisk|moden|ældre|\+50|nyuddannet)(?![a-zA-ZæøåÆØÅ])/gi,
    category: 'age_discrimination',
    label: 'Aldersdiskrimination',
    severity: 'high',
    suggestion: 'Aldersrelaterede ord kan diskriminere (Ligebehandlingsloven). Brug kompetence-baserede beskrivelser.',
  },
  {
    pattern: /(?<![a-zA-ZæøåÆØÅ])(rockstar|ninja|guru|warrior|aggressiv|dominerende|drengerøv|hardcore)(?![a-zA-ZæøåÆØÅ])/gi,
    category: 'gendered_masculine',
    label: 'Maskulint kodet sprog',
    severity: 'high',
    suggestion: 'Maskulint kodede ord tiltrækker overvejende mænd og afskrækker kvinder (Gaucher et al., 2011).',
  },
  {
    pattern: /(?<![a-zA-ZæøåÆØÅ])(støttende|samarbejdsvillig|indlevende|omsorgsfuld)(?![a-zA-ZæøåÆØÅ])/gi,
    category: 'gendered_feminine_balance',
    label: 'Kønsskæv beskrivelse',
    severity: 'medium',
    suggestion: 'Mange feminine kodede ord i ét opslag kan skubbe mandlige kandidater væk. Overvej balancen.',
  },
  {
    pattern: /han\/hun|mand\/kvinde/gi,
    category: 'direct_gender_spec',
    label: 'Direkte kønssprog',
    severity: 'high',
    suggestion: 'Undgå kønssprog med mindre det er juridisk begrundet i rollen.',
  },
  {
    pattern: /dansk baggrund|skandinavisk|kun europæere/gi,
    category: 'ethnicity',
    label: 'Etnicitetsdiskrimination',
    severity: 'high',
    suggestion: 'I strid med Forskelsbehandlingsloven. Angiv konkrete kompetencekrav i stedet.',
  },
  {
    pattern: /(?<![a-zA-ZæøåÆØÅ])(single|ung mor)(?![a-zA-ZæøåÆØÅ])|uden familieforpligtelser/gi,
    category: 'family_status',
    label: 'Civilstatus-diskrimination',
    severity: 'high',
    suggestion: 'Civilstatus og familiesituation er beskyttet i dansk lovgivning.',
  },
  {
    pattern: /skal være sund|uden begrænsninger|fysisk stærk/gi,
    category: 'disability',
    label: 'Handicap-diskrimination',
    severity: 'high',
    suggestion: 'Disse formuleringer kan diskriminere mod personer med handicap (Forskelsbehandlingsloven).',
  },
  {
    pattern: /(?<![a-zA-ZæøåÆØÅ])(kristen|muslim|jødisk)(?![a-zA-ZæøåÆØÅ])/gi,
    category: 'religion',
    label: 'Religiøs diskrimination',
    severity: 'high',
    suggestion: 'Religion er beskyttet med mindre den er en kerneopgave i jobbet.',
  },
  {
    pattern: /krigsmaskine|killer instinct|dominerer markedet|dominerer feltet/gi,
    category: 'aggressive_metaphor',
    label: 'Aggressiv metafor',
    severity: 'medium',
    suggestion: 'Krigsmetaforer ekskluderer og signalerer en usund kultur.',
  },
  {
    pattern: /passer ind i vores DNA|som en af os|en del af familien/gi,
    category: 'cultural_exclusion',
    label: 'Kulturel ekskludering',
    severity: 'medium',
    suggestion: 'Disse fraser signalerer in-group tænkning og modvirker diversitet.',
  },
  {
    pattern: /(?<![a-zA-ZæøåÆØÅ])(de bedste|top 1%|elitespiller)(?![a-zA-ZæøåÆØÅ])/gi,
    category: 'vague_elite_signal',
    label: 'Vagt elitesignal',
    severity: 'low',
    suggestion: 'Vage elitesignaler tiltrækker overmodige kandidater og skræmmer kompetente væk.',
  },
  {
    pattern: /kun fra de bedste universiteter/gi,
    category: 'education_elitism',
    label: 'Uddannelseselitisme',
    severity: 'medium',
    suggestion: 'Angiv konkrete kompetencer frem for navngivne institutioner.',
  },
];

const EN = [
  // Age discrimination — multi-word phrases are clear indicators; "young" alone too broad
  {
    pattern: /young professional|fresh graduate|recent graduate|youthful candidate|new grad(?:uate)?/gi,
    category: 'age_discrimination_en',
    label: 'Age discrimination',
    severity: 'high',
    suggestion: 'Age-related language may violate equality law. Use competency-based descriptions.',
  },
  // Masculine-coded language
  {
    pattern: /(?<![a-zA-Z])(aggressive|dominant|competitive|decisive|fearless|rockstar|ninja|guru|a-player|killer instinct|conquer|dominate)(?![a-zA-Z])/gi,
    category: 'gendered_masculine_en',
    label: 'Masculine-coded language',
    severity: 'high',
    suggestion: 'These words disproportionately attract male applicants (Gaucher et al., 2011).',
  },
  {
    pattern: /(?<![a-zA-Z])(wheelhouse)(?![a-zA-Z])/gi,
    category: 'gendered_masculine_en',
    label: 'Masculine-coded language',
    severity: 'medium',
    suggestion: 'Consider more neutral alternatives.',
  },
  // Feminine-coded language (balance check)
  {
    pattern: /(?<![a-zA-Z])(supportive|collaborative|empathetic|nurturing)(?![a-zA-Z])/gi,
    category: 'gendered_feminine_balance_en',
    label: 'Feminine-coded language',
    severity: 'medium',
    suggestion: 'Balance check — many feminine-coded words can deter male candidates.',
  },
  // Direct gender specification
  {
    pattern: /he\/she|him\/her|male or female|male\/female/gi,
    category: 'direct_gender_spec_en',
    label: 'Direct gender language',
    severity: 'high',
    suggestion: 'Avoid specifying gender unless legally required for the role.',
  },
  // Ethnicity / nationality
  {
    pattern: /native english speaker only|must be (american|british|european|western)|european background only/gi,
    category: 'ethnicity_en',
    label: 'Ethnicity discrimination',
    severity: 'high',
    suggestion: 'Specify concrete language skills, not national or ethnic background.',
  },
  // Family / civil status
  {
    pattern: /without family (obligations|commitments)|no family (obligations|commitments)|single candidate/gi,
    category: 'family_status_en',
    label: 'Civil status discrimination',
    severity: 'high',
    suggestion: 'Family and civil status requirements may violate equality law.',
  },
  // Disability
  {
    pattern: /must be (physically )?healthy|no physical limitations|fully able-bodied|no disabilities|physically strong and healthy/gi,
    category: 'disability_en',
    label: 'Disability discrimination',
    severity: 'high',
    suggestion: 'These formulations may discriminate against persons with disabilities.',
  },
  // Religion
  {
    pattern: /(?<![a-zA-Z])(christian|muslim|jewish|hindu|buddhist)(?![a-zA-Z])/gi,
    category: 'religion_en',
    label: 'Religious discrimination',
    severity: 'high',
    suggestion: 'Religion is protected unless it is a genuine occupational requirement.',
  },
  // Aggressive metaphors
  {
    pattern: /kill it|crush (the )?competition|dominate the market|war machine|battlefield mindset|go to war/gi,
    category: 'aggressive_metaphor_en',
    label: 'Aggressive metaphors',
    severity: 'medium',
    suggestion: 'Combat metaphors can signal an unhealthy culture and exclude candidates.',
  },
  // Cultural exclusion
  {
    pattern: /fits? (our|the) (culture|dna)|one of us|part of the family|culture fit only/gi,
    category: 'cultural_exclusion_en',
    label: 'Cultural exclusion language',
    severity: 'medium',
    suggestion: 'These phrases signal in-group thinking and may discourage diverse candidates.',
  },
  // Education elitism
  {
    pattern: /ivy league|top university|elite university|from the best (schools|universities)|only (from )?(harvard|stanford|mit|oxford|cambridge)/gi,
    category: 'education_elitism_en',
    label: 'Education elitism',
    severity: 'medium',
    suggestion: 'Specify concrete competencies rather than institution names.',
  },
  // Elite signals
  {
    pattern: /rock star|top performer|best of the best|world-class|10x engineer|unicorn candidate/gi,
    category: 'elite_signal_en',
    label: 'Elite signal language',
    severity: 'low',
    suggestion: 'Vague elite signals attract overconfident candidates and deter qualified ones.',
  },
];

export const BIAS_RULES = { da: DA, en: EN };

/**
 * Run client-side bias check on a single text string.
 * Returns an array of violations — empty array means no issues.
 */
export function checkBulletBias(text, language = 'da') {
  if (!text || !text.trim()) return [];
  const rules = BIAS_RULES[language] ?? DA;
  const violations = [];

  for (const rule of rules) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    const matches = [...text.matchAll(regex)];
    if (matches.length > 0) {
      violations.push({
        ...rule,
        matchedTexts: [...new Set(matches.map((m) => m[0].toLowerCase()))],
      });
    }
  }

  return violations;
}
