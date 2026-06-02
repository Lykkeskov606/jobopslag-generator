/**
 * One-time seed script: populates rag_sources with content + OpenAI embeddings.
 * Run with: npm run seed:rag
 *
 * Requires OPENAI_API_KEY and DATABASE_URL (or DATABASE_PUBLIC_URL) in environment.
 * Safe to re-run — existing rows with the same citation are skipped.
 */
require('dotenv').config();
const { pool } = require('../index');
const { getEmbedding } = require('../../services/embeddingService');

const SOURCES = [
  // ── Universal sources (English) ───────────────────────────────────────────
  {
    source_name: 'Schmidt & Hunter (1998, 2016)',
    citation: 'Schmidt, F.L. & Hunter, J.E. (1998). The validity and utility of selection methods in personnel psychology. Psychological Bulletin, 124(2), 262–274. Updated: Schmidt et al. (2016).',
    content_chunk: `Meta-analysis of 85 years of selection research covering over 32,000 studies.

Key predictive validity findings (r = correlation with job performance):
- Work sample tests: r = 0.54 (best single predictor)
- Cognitive ability (GMA): r = 0.51
- Structured interviews: r = 0.51
- Integrity tests: r = 0.46
- Unstructured interviews: r = 0.38
- Job experience (years): r = 0.18 — commonly required but poor predictor
- Education level/years: r = 0.10 — very weak predictor

Practical implication: Requiring "5+ years of experience" or specific educational credentials dramatically restricts the candidate pool while adding only marginal predictive value compared to structured interviews or work samples. Experience requirements over 3 years show diminishing returns in predicting performance.

Combination finding: GMA + structured interview predicts better than experience requirements alone. Replacing experience requirements with skills demonstrations improves both diversity and hire quality.`,
    jurisdictions: ['universal'],
    languages: ['en'],
  },
  {
    source_name: 'Iris Bohnet — What Works (2016)',
    citation: 'Bohnet, I. (2016). What Works: Gender Equality by Design. Harvard University Press.',
    content_chunk: `Evidence-based interventions for reducing hiring bias.

Key findings:
1. Criteria-first hiring: Setting evaluation criteria BEFORE reviewing applications reduces bias by 25–30%. When criteria are defined retroactively, evaluators unconsciously shift what "qualifies" to match their preferred candidate.

2. "Culture fit" as similarity bias: Culture fit assessments significantly disadvantage women and minorities. Evaluators systematically rate candidates higher when they share personal interests, background, or communication style — not when they are actually more qualified. Culture fit should be replaced with specific behavioural competencies.

3. Blind evaluation: Removing names and demographic markers from applications increases female call-back rates by 25–30% in field experiments.

4. Structured vs. unstructured evaluation: Unstructured interviews allow bias to compound across multiple dimensions. Standardized questions with pre-defined scoring criteria reduce this effect significantly.

5. Joint evaluation: Comparing candidates side-by-side against the same criteria reduces bias more than sequential evaluation.

Actionable implication: Job requirements should list specific, demonstrable competencies, not personality traits or cultural descriptors. "Fast-paced environment" and "fits our culture" in job ads attract a narrower, less diverse pool.`,
    jurisdictions: ['universal'],
    languages: ['en'],
  },
  {
    source_name: 'Gaucher, Friesen & Kay (2011)',
    citation: 'Gaucher, D., Friesen, J., & Kay, A.C. (2011). Evidence That Gendered Wording in Job Advertisements Exists and Sustains Gender Inequality. Journal of Personality and Social Psychology, 101(1), 109–128.',
    content_chunk: `Study of 4,000+ real job advertisements and four controlled experiments examining how gendered language affects candidate behaviour.

Key findings:
- Masculine-coded words in job ads reduce women's sense of belonging in the role even when they are fully qualified.
- Effect size: 19% fewer women apply to positions described with masculine-coded language compared to neutral equivalents.
- The effect is driven by reduced sense of belonging — not by perceived inability to do the job.
- Men are NOT significantly affected by feminine-coded language in ads.

Masculine-coded words identified: aggressive, ambitious, analytical, assertive, competitive, confident, decisive, determined, direct, dominant, driven, independent, leader, outperform, strong.

Feminine-coded words (reduce male applicants slightly): collaborative, committed, connected, dependable, interpersonal, loyal, responsible, sensitive, supportive, understanding.

Practical implication: Job ads using words like "competitive", "dominant", "aggressive", "rock star", or "top performer" generate significantly fewer female applications. Replacing these with neutral equivalents (e.g., "results-focused", "high-performing team", "motivated") increases application diversity without lowering quality.`,
    jurisdictions: ['universal'],
    languages: ['en'],
  },
  {
    source_name: 'Tett & Burnett (2003) — Person-Job Fit',
    citation: 'Tett, R.P. & Burnett, D.D. (2003). A personality trait-based interactionist model of job performance. Journal of Applied Psychology, 88(3), 500–517.',
    content_chunk: `Theory and evidence on personality-based person-job fit as a predictor of performance.

Key findings:
- Person-job fit (matching specific personality traits to specific job demands) is a stronger predictor of job performance than general "person-organisation fit" (culture fit).
- Trait activation principle: personality traits predict performance best when the job actually requires those traits. Conscientiousness predicts performance in structured, detail-oriented roles; agreeableness predicts performance in service and team roles.
- Culture fit as a construct is typically poorly defined and leads to homogeneous teams, reducing the diversity of cognitive styles and approaches.
- Teams with cognitive and personality diversity make higher-quality decisions than homogeneous teams, particularly for complex or novel problems.

Practical implication for job ads:
- Requirements like "must fit our culture" or "team player personality" are weak predictors and increase similarity bias.
- Better: specify which behaviours matter for the role ("comfortable prioritising multiple projects simultaneously", "able to give and receive direct feedback").
- Avoid personality trait requirements unless the trait can be directly linked to core job tasks.
- "Energetic", "enthusiastic", "passionate" are weak predictors with potential to screen out candidates based on communication style rather than capability.`,
    jurisdictions: ['universal'],
    languages: ['en'],
  },

  // ── Danish / DK-jurisdiction sources (Danish) ────────────────────────────
  {
    source_name: 'Ligebehandlingsloven (DK)',
    citation: 'LBK nr. 1678 af 19/11/2020 — Bekendtgørelse af lov om ligebehandling af mænd og kvinder med hensyn til beskæftigelse m.v.',
    content_chunk: `Dansk lov om ligebehandling af køn ved ansættelse (opdateret konsolidering 2020).

Centrale bestemmelser for jobopslag og ansættelse:

§ 2: Forbuddet mod direkte og indirekte diskrimination
Arbejdsgivere må ikke behandle arbejdstagere eller ansøgere ringere på grund af køn — hverken direkte (åbenlys kønsdiskrimination) eller indirekte (tilsyneladende neutrale krav der de facto stiller ét køn ringere).

§ 4: Jobopslag
Jobopslag må ikke angive kønspræference medmindre der er et ægte og afgørende erhvervsmæssigt krav til at stillingen besættes af et bestemt køn (fx skuespillerrolle eller personlig pleje med intimitetsaspekt).

§ 9: Graviditet og barsel
Arbejdsgiveren må ikke lægge vægt på graviditet, barselsorlov, forældreorlов eller adoption i ansættelsesprocessen. Spørgsmål om disse forhold i jobansøgninger eller interviews er ulovlige.

Indirekte diskrimination eksempel: Krav om "fuld tilgængelighed 24/7 uden personlige forpligtelser" stiller kvinder systematisk ringere og udgør sandsynligvis indirekte kønsdiskrimination.

Sanktioner: Overtrædelse medfører erstatningspligt og/eller bøde. Arbejdsgiveren bærer bevisbyrden ved sandsynliggjort diskrimination.`,
    jurisdictions: ['dk'],
    languages: ['da'],
  },
  {
    source_name: 'Forskelsbehandlingsloven (DK)',
    citation: 'LBK nr. 1001 af 24/08/2017 — Bekendtgørelse af lov om forbud mod forskelsbehandling på arbejdsmarkedet m.v.',
    content_chunk: `Dansk lov om forbud mod diskrimination på arbejdsmarkedet (konsolideret 2017).

Beskyttede karakteristika (§ 1):
Race, hudfarve, religion eller tro, politisk overbevisning, seksuel orientering, national, social eller etnisk oprindelse, alder og handicap.

Centrale regler for jobopslag og rekruttering:

Alder (§ 2a):
Krav der direkte eller indirekte favoriserer bestemte aldersgrupper er ulovlige medmindre der er en objektiv og saglig begrundelse. "Ung og dynamisk", "nyuddannet foretrukket", "maks. 35 år" uden saglig begrundelse udgør direkte aldersforskelsbehandling. Selv formelt neutrale formuleringer der de facto screener bestemte aldersgrupper fra kan være ulovlige.

Handicap (§ 2):
Fysiske krav (løfteevne, syn, hørelse) skal være objektivt nødvendige for at udføre de centrale jobfunktioner. Blanket-krav uden relation til konkrete jobopgaver er problematiske.

Religion og etnisk oprindelse:
"Flydende dansk i skrift og tale" kan udgøre indirekte diskrimination på baggrund af national/etnisk oprindelse hvis sprogkravet ikke er nødvendigt for stillingens kerneopgaver.

Bevisbyrde (§ 7a):
Når en ansøger sandsynliggør diskrimination, overgår bevisbyrden til arbejdsgiveren. Det er arbejdsgiveren der skal bevise at ligebehandlingsreglerne ikke er overtrådt.

Sanktioner: Erstatning og godtgørelse. Fagforeninger kan rejse sager på vegne af medlemmer.`,
    jurisdictions: ['dk'],
    languages: ['da'],
  },
  {
    source_name: 'Beskæftigelsesministeriets vejledning om jobopslag',
    citation: 'Beskæftigelsesministeriet (2021). Vejledning om ligebehandling og ikke-diskriminerende jobopslag. bm.dk.',
    content_chunk: `Ministeriets praktiske vejledning til arbejdsgivere om lovmedholdelige jobopslag.

Kerneprincipper:

1. Nødvendighedsprincippet
Jobopslag må kun indeholde krav der er nødvendige for at udføre stillingens kerneopgaver. Krav der ikke kan begrundes i konkrete arbejdsopgaver bør fjernes.

2. Proportionalitetsprincippet
Kravenes omfang skal stå mål med stillingens faktiske indhold. "10+ års erfaring" til en assistent-stilling er sandsynligvis uproportionalt og kan virke ekskluderende.

3. Sprogkrav
"Flydende dansk" er lovligt hvis det er nødvendigt for stillingen (fx kundekontakt, sagsbehandling). Det er problematisk hvis stillingens kerneopgaver kan udføres på engelsk eller andre sprog. Præcisér hvad sprogkravet dækker.

4. Erfaringskrav
Lange erfaringskrav (fx "5+ år i lignende stilling") bør begrundes konkret. Forskning viser at erfaringslængde er en svag prædiktor for præstationsevne. Overvej i stedet at beskrive specifikke kompetencer.

5. Fysiske krav
Krav om fysisk kapacitet (løfteevne, syn, hørelse, udholdenhed) er kun acceptable hvis de er objektivt nødvendige for de centrale jobfunktioner og ikke kan løses med rimelige tilpasninger.

6. Personlighedskrav
Krav som "struktureret personlighed", "social og udadvendt" bør kobles til konkrete adfærdsmæssige krav i stillingen. Generelle personlighedskrav risikerer at diskriminere på baggrund af handicap eller kulturelle normer.`,
    jurisdictions: ['dk'],
    languages: ['da'],
  },
  {
    source_name: 'DI\'s vejledning om mangfoldighed i rekruttering',
    citation: 'Dansk Industri (2022). Mangfoldighed i rekruttering — vejledning til virksomheder. di.dk.',
    content_chunk: `DI's anbefalinger for mangfoldig og inkluderende rekruttering baseret på forskning og best practice.

Evidensgrundlag:
McKinsey & Company (2018): Virksomheder i den øverste kvartil for køns- og etnisk mangfoldighed er 33% mere tilbøjelige til at overpræstere finansielt sammenlignet med branchemediannen.

Centrale anbefalinger:

1. Foruddefinerede kriterier
Evalueringskriterier skal sættes FØR gennemgang af ansøgninger. Studier viser at dette reducerer ubevidst bias med op til 50% sammenlignet med efterrationalisering til foretrukne kandidater.

2. Haloeffekten
Et generelt positivt helhedsindtryk påvirker vurderingen af specifikke kompetencer i positiv retning (og omvendt). Strukturerede interviews med separate pointskalaer per kompetence reducerer denne fejlkilde.

3. Alder og mangfoldighed
Teams med aldersblanding (25–65 år) træffer gennemsnitligt bedre beslutninger end aldershomogene teams, særligt på komplekse problemstillinger.

4. Kandidatpuljens bredde
"Expand the funnel"-tilgangen: at åbne op for ikke-traditionelle profiler (fx dem der mangler en specifik grad men har dokumenterede kompetencer) øger kvaliteten af den endelige ansættelse.

5. Jobopslaget som filter
Unødige krav i jobopslaget fungerer som ekskluderende filtre der primært rammer underrepræsenterede grupper. Hvert krav bør bestå testen: "Er dette nødvendigt for at lykkes i rollen fra dag ét?"`,
    jurisdictions: ['dk'],
    languages: ['da'],
  },
];

async function seed() {
  console.log('Seeding rag_sources...\n');

  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const src of SOURCES) {
    // Check if already exists
    const { rows: existing } = await pool.query(
      'SELECT id FROM rag_sources WHERE citation = $1',
      [src.citation]
    );
    if (existing.length > 0) {
      console.log(`  SKIP  ${src.source_name}`);
      skipped++;
      continue;
    }

    process.stdout.write(`  EMBED ${src.source_name} ... `);
    const embedding = await getEmbedding(src.content_chunk);
    if (!embedding) {
      console.log('FAILED (no OPENAI_API_KEY or API error)');
      // Insert without embedding so content is still available
      await pool.query(
        `INSERT INTO rag_sources (source_name, citation, content_chunk, embedding, jurisdictions, languages)
         VALUES ($1, $2, $3, NULL, $4, $5)`,
        [src.source_name, src.citation, src.content_chunk, src.jurisdictions, src.languages]
      );
      failed++;
      continue;
    }

    await pool.query(
      `INSERT INTO rag_sources (source_name, citation, content_chunk, embedding, jurisdictions, languages)
       VALUES ($1, $2, $3, $4::vector, $5, $6)`,
      [src.source_name, src.citation, src.content_chunk,
       JSON.stringify(embedding), src.jurisdictions, src.languages]
    );
    console.log('OK');
    inserted++;
  }

  console.log(`\nDone. Inserted: ${inserted}, Skipped: ${skipped}, Failed (no embedding): ${failed}`);
  if (failed > 0) {
    console.log('\nSources without embeddings were still inserted as text.');
    console.log('Set OPENAI_API_KEY and re-run to add embeddings (existing rows will be skipped).');
    console.log('To re-embed a specific source, delete its row first: DELETE FROM rag_sources WHERE citation = \'...\';');
  }
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Seed failed:', err);
    pool.end();
    process.exit(1);
  });
