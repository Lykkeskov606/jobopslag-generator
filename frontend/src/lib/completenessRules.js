// Completeness checks for job postings.
// Analyses job title + bullets + optional fields and returns the checks
// whose content is NOT already present in the user's input.
//
// Each check includes a 'why' field grounded in candidate psychology —
// this is shown in the UI so the recruiter understands the value of filling it in.
//
// Shared by Tier 1 and Tier 2 — do not add tier-specific logic here.

export const COMPLETENESS_CHECKS = [
  {
    id: 'team_size',
    label: {
      da: 'Teamstørrelse og samarbejde',
      en: 'Team size and collaboration',
    },
    why: {
      da: 'Kandidater vil vide hvem de arbejder med — det påvirker beslutningen mere end titlen.',
      en: 'Candidates want to know who they\'ll work with — it influences their decision more than the title.',
    },
    placeholder: {
      da: 'fx: 6-personers team, tæt samarbejde med produkt og design',
      en: 'e.g. 6-person team, works closely with product and design',
    },
    detect: {
      da: /\bteam\b|\bkollega|\bafdeling\b|\bgruppe\b|\bperson(er)?\b|\bmedarbejder|\bsamarbejder\b/i,
      en: /\bteam\b|\bcolleague|\bdepartment\b|\bgroup\b|\bmember\b|\bwork(s)? (with|alongside|together)\b/i,
    },
  },
  {
    id: 'reporting',
    label: {
      da: 'Rapportering og ledelsesstruktur',
      en: 'Reporting structure',
    },
    why: {
      da: 'Hvem man refererer til afslører reel indflydelse og karrierevej — det er afgørende for ambitiøse kandidater.',
      en: 'Who you report to reveals real influence and career trajectory — critical for ambitious candidates.',
    },
    placeholder: {
      da: 'fx: rapporterer til Head of Engineering, høj autonomi',
      en: 'e.g. reports to the Head of Engineering, high autonomy',
    },
    detect: {
      da: /rapporter|\bleder\b|\bdirektør|\bchef\b|\bmanager|\bCTO\b|\bCEO\b|\bhead of\b|\bVP\b/i,
      en: /report(s)? to|\bmanager\b|\blead\b|\bdirector\b|\bhead of\b|\bVP\b|\bCTO\b|\bCEO\b/i,
    },
  },
  {
    id: 'remote_policy',
    label: {
      da: 'Arbejdsform (remote / hybrid / kontor)',
      en: 'Work arrangement (remote / hybrid / office)',
    },
    why: {
      da: 'Remote/hybrid er et af de hyppigst stillede spørgsmål fra kandidater i dag. Tvetydighed øger frafald.',
      en: 'Remote/hybrid is one of the most frequently asked questions from candidates today. Ambiguity increases drop-off.',
    },
    placeholder: {
      da: 'fx: hybrid (2 dage hjemme), kontor i København',
      en: 'e.g. hybrid (2 days remote), office in London',
    },
    detect: {
      // "fleksibel" removed — too broad (matches "fleksibel teamplayer" etc.)
      // "on.site" fixed to on[- ]?site (unescaped dot matched any char)
      da: /\bremote\b|\bhybrid\b|\bhjemmekontor\b|\bon[- ]?site\b|\bhjemmefra\b/i,
      en: /\bremote\b|\bhybrid\b|\bhome[- ]?office\b|\bflexible work\b|\bon[- ]?site\b|\bwork from home\b/i,
    },
    detectInLocation: {
      da: /\bremote\b|\bhybrid\b|\bhjemmekontor\b/i,
      en: /\bremote\b|\bhybrid\b|\bhome[- ]?office\b/i,
    },
  },
  {
    id: 'success_criteria',
    label: {
      da: 'Succeskriterier for rollen',
      en: 'Success criteria for the role',
    },
    why: {
      da: 'Kandidater søger klarhed om hvad der definerer succes — det signalerer en moden organisation og øger ansøgerkvantitet.',
      en: 'Candidates seek clarity on what defines success — it signals a mature organisation and increases application rates.',
    },
    placeholder: {
      da: 'fx: lanceret v2 af produktet og reduceret churn med 15% efter 12 måneder',
      en: 'e.g. launched v2 of the product and reduced churn by 15% after 12 months',
    },
    detect: {
      // Narrow pattern: only explicit mentions of success criteria or KPIs,
      // not generic "goal" / "result" words that appear in almost every posting.
      da: /\bsucceskriterier?\b|\bsuccess.kriterier?\b|\bkpi\b|\bmåles på\b|\bi de første\s+\d|\befter\s+\d+\s*(måned|år)\b/i,
      en: /\bsuccess criteria\b|\bsuccess metrics?\b|\bkpi\b|\bmeasured (by|on)\b|\bin the first\s+\d|\bwithin\s+\d+\s*month/i,
    },
  },
];

/**
 * Run completeness check on job posting inputs.
 * Returns only the checks that are NOT already addressed in the input.
 *
 * @param {object} opts
 * @param {string}   opts.jobTitle
 * @param {string[]} opts.bullets
 * @param {string}   opts.location   - optional location field value
 * @param {string}   opts.language   - 'da' | 'en'
 * @returns {Array}  array of missing COMPLETENESS_CHECKS entries
 */
export function runCompletenessCheck({ jobTitle = '', bullets = [], location = '', workMode = '', teamComposition = '', language = 'da' }) {
  const lang = language === 'en' ? 'en' : 'da';
  const fullText = [jobTitle, ...bullets].join(' ');

  return COMPLETENESS_CHECKS.filter((check) => {
    // team_size: auto-resolved if teamComposition field is filled
    if (check.id === 'team_size' && teamComposition.trim()) return false;

    // For remote_policy: also check the location field and workMode dropdown
    if (check.detectInLocation) {
      const locPattern = check.detectInLocation[lang];
      if (locPattern && locPattern.test(location)) return false;
      // If user selected a workMode, remote_policy is addressed
      if (workMode && workMode.trim()) return false;
    }

    const pattern = check.detect[lang];
    return !pattern.test(fullText);
  });
}
