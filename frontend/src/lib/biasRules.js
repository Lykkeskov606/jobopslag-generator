// Client-side bias rules for inline checking as the user types.
// Patterns mirror backend/src/db/migrations/001_initial.sql exactly.
// Running these in the browser means instant feedback without an API round-trip.

const DA = [
  {
    // \b doesn't catch Danish chars — use lookaround instead
    pattern: /(?<![a-zA-ZæøåÆØÅ])(ung|yngre|frisk|moden|ældre|\+50|senior|junior|nyuddannet)(?![a-zA-ZæøåÆØÅ])/gi,
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
    suggestion: 'Disse formulringer kan diskriminere mod personer med handicap (Forskelsbehandlingsloven).',
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
  {
    pattern: /(?<![a-zA-Z])(aggressive|dominant|competitive|decisive|fearless|rockstar|ninja|guru|a-player)(?![a-zA-Z])/gi,
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
  {
    pattern: /(?<![a-zA-Z])(supportive|collaborative|empathetic|nurturing)(?![a-zA-Z])/gi,
    category: 'gendered_feminine_balance_en',
    label: 'Feminine-coded language',
    severity: 'medium',
    suggestion: 'Balance check — many feminine-coded words can deter male candidates.',
  },
  {
    pattern: /rock star|top performer|best of the best|world-class/gi,
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
    // Reset lastIndex for global regexes
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
