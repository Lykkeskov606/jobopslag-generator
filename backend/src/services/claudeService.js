const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const db = require('../db');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';
const COST_INPUT_CENTS_PER_TOKEN  = 0.0003;
const COST_OUTPUT_CENTS_PER_TOKEN = 0.0015;

function readPrompt(filename) {
  return fs.readFileSync(path.join(__dirname, '../../prompts', filename), 'utf8');
}

function readSharedRules(language) {
  return fs.readFileSync(
    path.join(__dirname, '../../prompts', `shared-content-rules-${language}.txt`),
    'utf8'
  );
}

function fillTemplate(template, vars) {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v ?? ''),
    template
  );
}

// ── Refusal detection ─────────────────────────────────────────────────────────

const REFUSAL_PATTERNS = [
  /\bi (cannot|can't|am unable to|won't|will not|do not|don't) (write|create|generate|produce|help with|assist with|provide)\b/i,
  /\bcannot (write|create|generate|help with|assist)\b.*\bthis\b/i,
  /\bthis (request|content|type of content|kind of content) (violates|goes against|conflicts with|is against)\b/i,
  /\bi('m| am) (not able|unable) to (write|create|generate|help)\b/i,
  /\bi apologize.*but i (cannot|can't|am unable)/i,
  /\bi'm sorry.*but i (cannot|can't|am unable)/i,
  /\bdet kan jeg ikke (hjælpe med|skrive|lave|generere)\b/i,
  /\bjeg kan ikke (skrive|lave|hjælpe med|generere)\b/i,
];

function isRefusal(text) {
  if (/<variant_a>/i.test(text)) return false; // Valid response with expected tags
  if (REFUSAL_PATTERNS.some((p) => p.test(text))) return true;
  if (text.trim().length < 200) return true; // Very short response without variant tags
  return false;
}

// ── Psychology framework library ──────────────────────────────────────────────
// Each generation randomly picks 2 different approaches from this validated library.
// Frameworks: AIDA, WIIFM, Cialdini (reciprocity, commitment/consistency,
// social proof, authority, liking, scarcity), Tactical Empathy (Chris Voss).

const APPROACHES = {
  da: [
    {
      name: 'AIDA + WIIFM',
      instructions: `ATTENTION (åbning, 1–2 sætninger):
Tal DIREKTE til kandidatens indre motivation eller den kerneudfordring rollen indebærer. Start ALDRIG med virksomhedsnavnet eller "Vi søger". Formlen: [kandidatens rolle/identitet] møder [den reelle udfordring eller mulighed]. Eks: "Vil du bygge systemer der rent faktisk holder?" / "Der er forskel på at koordinere projekter og på at eje dem."

INTEREST (rollebeskrivelse, 2–3 afsnit):
Beskriv hvad kandidaten FAKTISK laver i hverdagen — de vigtigste ansvarsområder, hvem de samarbejder med, og hvad succes ser ud i rollen. Brug aktive sætninger og specifikke eksempler fra bullets. Undgå generaliseringer og corporate-speak.

DESIRE — VI TILBYDER:
List præcist hvad kandidaten vinder ved at takke ja: kompensationsramme eller fordele, konkrete vækst- og udviklingsmuligheder, fleksibilitet, kultur, formål, differentierende fordele.

ACTION (2–3 sætninger):
Én klar opfordring. Fortæl hvad vi gerne vil modtage (CV, ansøgning, portfolio). Varm, direkte tone — ikke corporate boilerplate.`,
    },
    {
      name: 'TAKTISK EMPATI + CIALDINI',
      instructions: `ÅBNING — Taktisk empati/labeling (1–2 sætninger):
LABEL kandidatens sandsynlige professionelle følelse eller frustration med sin nuværende situation. Vis at vi forstår kandidatens indre verden — vi sælger IKKE en stilling, vi anerkender en oplevelse. Eks: "Du kender sandsynligvis fornemmelsen: man har kompetencen, men ikke mandatet til at gøre en reel forskel." / "Det er svært at finde en rolle der matcher både fagligheden og det ansvar man er klar til." Brug "du"-form konsekvent. Åbn ALDRIG med virksomhedsnavnet.

ROLLEN — Commitment/consistency (Cialdini):
Beskriv rollen ved at frame den om de kvaliteter kandidaten sandsynligvis allerede identificerer sig med. "Hvis du er typen der trives med at..." / "Du arbejder bedst når...". Beskriv det konkrete ansvar og hverdagen fra kandidatens perspektiv.

SOCIAL PROOF (Cialdini):
Ét konkret, autentisk signal om kulturen set indefra. Hvad siger folk der er her efter 6 måneder? Gør det specifikt og troværdigt — ikke "vi har en fantastisk kultur".

DU FÅR:
List minimum 4 konkrete fordele. Brug Cialdinis liking-princip: vis at reelle mennesker tilbyder dette, ikke en HR-afdeling.

AFSLUTNING:
Varm, personlig invitation — ikke en "ansøg nu"-knap. Vis nysgerrighed på kandidaten som person, ikke kun som kompetence.`,
    },
    {
      name: 'CIALDINI: RECIPROCITET + AUTORITET',
      instructions: `ÅBNING — Reciprocitet (giv først):
Åbn med noget genuint værdifuldt til kandidaten — en indsigt om branchen, rollen eller udfordringen — INDEN du beder om noget. Eks: "De fleste i [jobtitel]-roller undervurderer hvor stor forskel X faktisk gør i hverdagen." / "Her er noget værd at vide inden du overvejer dette..." Skab goodwill og taknemlighed inden ansøgningen.

ROLLEN — Autoritet (Cialdini):
Byg troværdighed med konkrete, faktabaserede grunde til at denne rolle/organisation er signifikant. Undgå selvros. Brug specifikke tal, resultater eller ansvarsomfang fra bullets. Kandidaten skal føle de læser om noget der er deres seriøse opmærksomhed værd.

HVAD DU FÅR — WIIFM:
List hvad kandidaten konkret vinder. Kæd autoritet til fordele: "Fordi vi er [autoritetssignal], kan vi tilbyde...". Specifikt, ikke generisk.

OPFORDRING:
Bekræft troværdighed i CTA'en. Gør næste skridt let og tydeligt — én klar handling.`,
    },
    {
      name: 'CIALDINI: KNAPHED + SYMPATI',
      instructions: `ÅBNING — Knaphed (scarcity):
Signal at denne rolle er usædvanlig eller sjælden — UDEN at lyde arrogant. Fokuser på hvad der gør KOMBINATIONEN unik: det specifikke ansvar + frihed + tidspunkt. Eks: "Den her type roller opstår sjældent: fuld ejerskab over X og Y, netop nu hvor [noget tidsmæssigt relevant]."

ROLLEN — Commitment/consistency (Cialdini):
Frame rollen om egenskaber kandidaten sandsynligvis allerede har og er stolt af. Aktivér consistency-princippet: kandidaten ser sig selv som nogen der passer præcis her naturligt. Konkret hverdagsbeskrivelse fra bullets.

SYMPATI — Liking (Cialdini):
Vis virksomheden/teamet som virkelige, sympatiske mennesker. Ét autentisk detalje om kultur, team eller arbejdsform der skaber tilhørsforhold og varme. Undgå alt corporate-speak.

DU FÅR + OPFORDRING:
Fordele formuleret af rigtige mennesker — ikke HR. Afslut med en invitation der viser vi allerede er nysgerrige på kandidaten — inden de har søgt.`,
    },
  ],
  en: [
    {
      name: 'AIDA + WIIFM',
      instructions: `ATTENTION (opening, 1–2 sentences):
Speak DIRECTLY to the candidate's inner motivation or the core challenge this role involves. NEVER start with the company name or "We are looking for". Formula: [candidate's role/identity] meets [the real challenge or opportunity]. Examples: "There's a difference between shipping code and owning a system." / "Great HR people don't just fill roles — they change how teams are built."

INTEREST (role description, 2–3 paragraphs):
Describe what the candidate ACTUALLY does day-to-day — the key responsibilities, who they work with, and what success looks like. Active sentences, specific examples from the bullets. Avoid generalisations and corporate language.

DESIRE — WE OFFER:
List precisely what the candidate gains by saying yes: compensation range or specific benefits, real growth opportunities, flexibility, culture, purpose, differentiating perks.

ACTION (2–3 sentences):
One clear instruction. Tell the candidate what to send (CV, cover letter, portfolio). Warm, direct tone — not corporate boilerplate.`,
    },
    {
      name: 'TACTICAL EMPATHY + CIALDINI',
      instructions: `OPENING — Tactical empathy / labelling (1–2 sentences):
LABEL the candidate's likely professional feeling or frustration with their current situation. Show you understand their inner world — you are NOT selling a job, you are acknowledging an experience. Examples: "You probably know the feeling: you have the skills, but not the mandate to make a real difference." / "It's hard to find a role that matches both the expertise you've built and the level of ownership you're ready for." Use "you" throughout. Never open with the company name.

THE ROLE — Commitment/consistency (Cialdini):
Describe the role by framing it around qualities the candidate likely already identifies with. "If you're the kind of person who thrives when..." / "You do your best work when...". Describe the real responsibilities and day-to-day from the candidate's perspective.

SOCIAL PROOF (Cialdini):
One concrete, authentic signal about the culture from the inside. What do people who work here say at 6 months in? Make it specific and credible — not "we have a great culture".

YOU'LL GET:
List at least 4 concrete benefits. Apply Cialdini's liking principle: show real humans are offering this, not an HR department.

CLOSING:
Warm, personal invitation — not an "apply now" button. Show genuine curiosity about the candidate as a person, not just a skill set.`,
    },
    {
      name: 'CIALDINI: RECIPROCITY + AUTHORITY',
      instructions: `OPENING — Reciprocity (give first):
Open with something genuinely valuable to the candidate — an insight about the industry, the role, or the challenge — BEFORE asking anything of them. Examples: "Most [job title] roles underestimate how much X actually matters day-to-day." / "Here's something worth knowing before you consider this role..." Create goodwill before the application.

THE ROLE — Authority (Cialdini):
Build credibility with concrete, fact-based reasons why this role or organisation is significant. No self-praise. Use specific numbers, scope, or outcomes from the bullets. The candidate should feel they're reading about something worth their serious attention.

WHAT YOU'LL GET — WIIFM:
List what the candidate concretely gains. Link authority to benefits: "Because we are [authority signal], we can offer...". Specific, not generic.

APPLICATION:
Reinforce credibility in the CTA. Make the next step feel easy and obvious — one clear action.`,
    },
    {
      name: 'CIALDINI: SCARCITY + LIKING',
      instructions: `OPENING — Scarcity:
Signal that this role is unusual or rare — WITHOUT sounding arrogant. Focus on what makes the COMBINATION unique: the specific scope + autonomy + timing. Examples: "Roles like this don't come up often: full ownership of X and Y, at exactly the moment when..."

THE ROLE — Commitment/consistency (Cialdini):
Frame the role around qualities the candidate likely already has and is proud of. Activate the consistency principle: the candidate sees themselves as someone who fits here naturally. Concrete day-to-day from the bullets.

LIKING (Cialdini):
Show the company/team as real, likeable humans. One authentic detail about the culture, team, or way of working that creates genuine connection. No corporate language.

YOU'LL GET + CTA:
Benefits listed by real people — not HR. Close with an invitation that shows you're already curious about the candidate — before they've applied.`,
    },
  ],
};

function pickTwoDifferent(n) {
  const a = Math.floor(Math.random() * n);
  let b;
  do { b = Math.floor(Math.random() * n); } while (b === a);
  return [a, b];
}

function buildApproachBlock(approach, variantLabel) {
  return `━━━ VARIANT ${variantLabel} — ${approach.name} ━━━\n\n${approach.instructions}`;
}

// ── Core Claude call ──────────────────────────────────────────────────────────

function extractVariants(text) {
  const a = text.match(/<variant_a>([\s\S]*?)<\/variant_a>/i);
  const b = text.match(/<variant_b>([\s\S]*?)<\/variant_b>/i);
  if (a && b) {
    return { variant_a: a[1].trim(), variant_b: b[1].trim() };
  }
  const half = Math.floor(text.length / 2);
  return { variant_a: text.slice(0, half).trim(), variant_b: text.slice(half).trim() };
}

async function callClaude(userMessage, promptFile, projectId, userId, stepNumber) {
  const start = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: userMessage }],
      });
      const latencyMs = Date.now() - start;
      const inp = resp.usage.input_tokens;
      const out = resp.usage.output_tokens;
      const costCents = Math.round(inp * COST_INPUT_CENTS_PER_TOKEN + out * COST_OUTPUT_CENTS_PER_TOKEN);
      const responseText = resp.content[0].text;

      db.query(
        `INSERT INTO ai_calls
         (project_id, user_id, step_number, prompt_file, response_text,
          tokens_input, tokens_output, cost_cents, latency_ms, ai_model_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [projectId ?? null, userId ?? null, stepNumber ?? null,
         promptFile, responseText, inp, out, costCents, latencyMs, MODEL]
      ).catch(() => {});

      return responseText;
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
    }
  }
}

// ── Main generation function ──────────────────────────────────────────────────

async function generateJobPosting({ jobTitle, bullets, language, templateContent, location, startDate, employmentType, projectId, userId }) {
  const promptFile = `jobopslag-${language}.txt`;
  const template = readPrompt(promptFile);
  const bulletsText = bullets.map((b) => `• ${b}`).join('\n');
  const templateSection = templateContent
    ? `\n${language === 'da' ? 'VIRKSOMHEDENS SKABELON/TONE' : 'COMPANY TEMPLATE/TONE'}:\n${templateContent}`
    : '';

  const isDa = language === 'da';
  const contextParts = [
    location       && `${isDa ? 'Lokation'        : 'Location'}: ${location}`,
    startDate      && `${isDa ? 'Startdato'        : 'Start date'}: ${startDate}`,
    employmentType && `${isDa ? 'Ansættelsestype'  : 'Employment type'}: ${employmentType}`,
  ].filter(Boolean);
  const contextLines = contextParts.length ? contextParts.join('\n') : '';

  const sharedRules = readSharedRules(language);

  // Pick two different psychology approaches randomly for this generation
  const approaches = APPROACHES[language];
  const [ia, ib] = pickTwoDifferent(approaches.length);
  const variantAApproach = buildApproachBlock(approaches[ia], 'A');
  const variantBApproach = buildApproachBlock(approaches[ib], 'B');

  const prompt = fillTemplate(template, {
    job_title: jobTitle,
    bullets: bulletsText,
    template_section: templateSection,
    context_lines: contextLines,
    shared_content_rules: sharedRules,
    variant_a_approach: variantAApproach,
    variant_b_approach: variantBApproach,
  });

  const text = await callClaude(prompt, promptFile, projectId, userId, 2);

  if (isRefusal(text)) {
    const err = new Error('content_refused');
    err.status = 422;
    throw err;
  }

  return extractVariants(text);
}

module.exports = { generateJobPosting };
