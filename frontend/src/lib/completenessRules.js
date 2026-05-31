// Completeness checks for job postings.
// Analyses job title + bullets + optional fields and returns the checks
// whose content is NOT already present in the user's input.
//
// Shared by Tier 1 and Tier 2 — do not add tier-specific logic here.

export const COMPLETENESS_CHECKS = [
  {
    id: 'team_size',
    label: {
      da: 'Teamstørrelse og samarbejde',
      en: 'Team size and collaboration',
    },
    question: {
      da: 'Hvor mange er i teamet? Hvem samarbejder kandidaten tæt med?',
      en: 'How many people are on the team? Who will the candidate work closely with?',
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
    question: {
      da: 'Hvem rapporterer kandidaten til? Hvad er ledelsesstilen?',
      en: 'Who does the candidate report to? What is the management style?',
    },
    placeholder: {
      da: 'fx: rapporterer til Head of Engineering, autonomt arbejde',
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
    question: {
      da: 'Kan man arbejde remote? Hybrid? Fuld tid på kontoret?',
      en: 'Is remote work possible? Hybrid? Full-time on site?',
    },
    placeholder: {
      da: 'fx: hybrid (2 dage hjemme), kontor i København',
      en: 'e.g. hybrid (2 days remote), office in London',
    },
    detect: {
      da: /\bremote\b|\bhybrid\b|\bhjemmekontor\b|\bfleksibel\b|\bon.site\b|\bhjemmefra\b/i,
      en: /\bremote\b|\bhybrid\b|\bhome office\b|\bflexible work\b|\bon.site\b|\bwork from home\b/i,
    },
    // Also check location field — if it contains remote/hybrid keywords, skip
    detectInLocation: {
      da: /\bremote\b|\bhybrid\b|\bhjemmekontor\b/i,
      en: /\bremote\b|\bhybrid\b|\bhome office\b/i,
    },
  },
  {
    id: 'success_criteria',
    label: {
      da: 'Succeskriterier for rollen',
      en: 'Success criteria for the role',
    },
    question: {
      da: 'Hvad ser succes ud i denne rolle efter 6–12 måneder?',
      en: 'What does success look like in this role after 6–12 months?',
    },
    placeholder: {
      da: 'fx: har lanceret v2 af produktet og reduceret churn med 15%',
      en: 'e.g. launched v2 of the product and reduced churn by 15%',
    },
    detect: {
      da: /\bsucces|\bkpi\b|\bmål\b|\bresultat|\blever(er)?\b|\bansvarlig for\b|\bopnå\b/i,
      en: /\bsuccess\b|\bkpi\b|\bgoal\b|\btarget\b|\bdeliver\b|\bachieve\b|\bresponsible for\b|\bmeasure\b/i,
    },
  },
  {
    id: 'compensation',
    label: {
      da: 'Løn og fordele',
      en: 'Salary and benefits',
    },
    question: {
      da: 'Hvad er lønrammen? Er der bonus, pension eller andre fordele?',
      en: 'What is the salary range? Is there a bonus, pension, or other benefits?',
    },
    placeholder: {
      da: 'fx: 55.000–65.000 kr/mdr + pension og sundhedsforsikring',
      en: 'e.g. $80k–100k + pension and health insurance',
    },
    detect: {
      da: /\bløn\b|\bkompensation\b|\bbonus\b|\bpension\b|\baktier\b|\bbenefit|\bsalary\b|\bbetaling\b/i,
      en: /\bsalary\b|\bcompensation\b|\bbonus\b|\bpension\b|\bequity\b|\bbenefit|\bpackage\b|\bpay\b/i,
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
export function runCompletenessCheck({ jobTitle = '', bullets = [], location = '', language = 'da' }) {
  const lang = language === 'en' ? 'en' : 'da';
  const fullText = [jobTitle, ...bullets].join(' ');

  return COMPLETENESS_CHECKS.filter((check) => {
    // For remote_policy: also check the location field for remote/hybrid keywords
    if (check.detectInLocation) {
      const locPattern = check.detectInLocation[lang];
      if (locPattern && locPattern.test(location)) return false;
    }

    const pattern = check.detect[lang];
    return !pattern.test(fullText);
  });
}
