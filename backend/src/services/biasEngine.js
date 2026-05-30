const db = require('../db');

const CATEGORY_LABELS = {
  age_discrimination: 'Age discrimination (Danish law)',
  gendered_masculine: 'Masculine-coded language',
  gendered_feminine_balance: 'Feminine-coded language (balance check)',
  direct_gender_spec: 'Direct gender specification',
  ethnicity: 'Ethnicity/nationality discrimination',
  family_status: 'Family/civil status discrimination',
  disability: 'Disability discrimination',
  religion: 'Religious discrimination',
  aggressive_metaphor: 'Aggressive metaphors',
  cultural_exclusion: 'Cultural exclusion language',
  vague_elite_signal: 'Vague elite signal',
  education_elitism: 'Education elitism',
  gendered_masculine_en: 'Masculine-coded language (EN)',
  gendered_feminine_balance_en: 'Feminine-coded language (EN)',
  elite_signal_en: 'Elite signal language (EN)',
};

function checkTierC(text, language) {
  const warnings = [];
  const words = text.trim().split(/\s+/).filter(Boolean);

  if (words.length > 800) {
    warnings.push({
      tier: 'C',
      category: 'word_count',
      label: 'Word count',
      severity: 'medium',
      message: language === 'da'
        ? `${words.length} ord — overvej at forkorte til under 800 ord`
        : `${words.length} words — consider shortening to under 800 words`,
    });
  }

  const wiifmDa = /tilbyder|du får|vi tilbyder|fordele|fleksibel|arbejdsmiljø|løn|vækst|benefit/i;
  const wiifmEn = /you.ll get|we offer|benefit|flexible|growth|salary|compensation|perk/i;
  const wiifmPattern = language === 'da' ? wiifmDa : wiifmEn;

  if (!wiifmPattern.test(text)) {
    warnings.push({
      tier: 'C',
      category: 'wiifm_missing',
      label: 'WIIFM missing',
      severity: 'medium',
      message: language === 'da'
        ? 'WIIFM mangler — hvad får kandidaten konkret ud af jobbet?'
        : 'WIIFM missing — what does the candidate concretely get from this job?',
    });
  }

  const mustHaveCount = (text.match(/\bskal\b|\bkræver\b|\bobligatorisk\b|\bmust\b|\brequired\b|\bmandatory\b/gi) || []).length;
  if (mustHaveCount >= 10) {
    warnings.push({
      tier: 'C',
      category: 'too_many_requirements',
      label: 'Too many requirements',
      severity: 'low',
      message: language === 'da'
        ? `${mustHaveCount} obligatoriske krav — overvej at reducere til maks 5–7`
        : `${mustHaveCount} mandatory requirements — consider reducing to max 5–7`,
    });
  }

  return warnings;
}

async function runBiasCheck(text, language, projectId, userId, stepNumber) {
  let rules = [];
  try {
    const { rows } = await db.query(
      `SELECT id, pattern, category, severity
       FROM bias_rules
       WHERE active = true AND $1 = ANY(languages)`,
      [language]
    );
    rules = rows;
  } catch (err) {
    console.error('Bias rules DB load failed:', err.message);
  }

  const violations = [];
  for (const rule of rules) {
    try {
      const regex = new RegExp(rule.pattern, 'gi');
      const matches = [...text.matchAll(regex)];
      for (const match of matches) {
        violations.push({
          tier: 'AB',
          category: rule.category,
          label: CATEGORY_LABELS[rule.category] || rule.category,
          severity: rule.severity,
          matchedText: match[0],
          source: 'input',
        });

        db.query(
          `INSERT INTO bias_violations
           (project_id, user_id, step_number, rule_triggered, text_snippet, user_action)
           VALUES ($1, $2, $3, $4, $5, 'pending')`,
          [projectId ?? null, userId ?? null, stepNumber ?? null, rule.category, match[0]]
        ).catch(() => {});
      }
    } catch {
      // skip malformed patterns
    }
  }

  return violations;
}

module.exports = { runBiasCheck, checkTierC };
