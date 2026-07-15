const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const db = require('../db');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';
// USD-cents per token (Sonnet pricing: $3 / $15 per MTok) — ai_calls.cost_cents
// is therefore USD-cents, NOT DKK-øre. Converted to DKK at display/budget time
// via utils/currency.js (USD_TO_DKK_RATE).
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

// ── Template structure parser (HTML-based) ───────────────────────────────────
// Uses mammoth's HTML output so bold-paragraph headings (common in DESMI-style
// templates) are reliably detected, unlike raw-text heuristics which conflate
// bullet items with headings and miss headings whose titles contain multiple
// lowercase words.

function _stripHtmlTags(h) {
  return h
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/ +/g, ' ')
    .trim();
}

function parseDocxTemplateFromHtml(html) {
  if (!html?.trim()) return [];
  const sections = [];
  // orderedLines preserves the exact document order of paragraphs and bullets
  // within each section so COPY sections can be reproduced verbatim including
  // interleaved benefit-heading/description pairs (e.g. DESMI perks).
  let currentTitle = null, currentParagraphs = [], currentBullets = [], currentOrderedLines = [];

  function flush() {
    if (currentTitle !== null) {
      sections.push({
        title: currentTitle,
        paragraphs: [...currentParagraphs],
        bullets: [...currentBullets],
        orderedLines: [...currentOrderedLines],
      });
    }
    currentTitle = null; currentParagraphs = []; currentBullets = []; currentOrderedLines = [];
  }

  const re = /<(p|ul|h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1].toLowerCase(), inner = m[2], block = m[0];

    if (/^h\d$/.test(tag)) {
      flush();
      currentTitle = _stripHtmlTags(inner);
      continue;
    }
    if (tag === 'ul') {
      const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
        .map(x => _stripHtmlTags(x[1])).filter(Boolean);
      if (currentTitle !== null) {
        currentBullets.push(...items);
        for (const item of items) currentOrderedLines.push({ type: 'bullet', text: item });
      }
      continue;
    }
    // Paragraph: detect bold-only headings (DESMI style: <p><strong>Title</strong></p>
    // or <p><strong>Title</strong><br />body...</p>)
    const boldBr   = block.match(/^<p[^>]*><strong>([^<]{1,120})<\/strong>\s*<br\s*\/?>([\s\S]*?)<\/p>$/i);
    const boldOnly = block.match(/^<p[^>]*>\s*<strong>([^<]{1,120})<\/strong>\s*<\/p>$/i);
    if (boldBr) {
      flush();
      currentTitle = boldBr[1].replace(/:\s*$/, '').trim();
      const body = _stripHtmlTags(boldBr[2]).trim();
      if (body) {
        currentParagraphs.push(body);
        currentOrderedLines.push({ type: 'paragraph', text: body });
      }
    } else if (boldOnly) {
      flush();
      currentTitle = boldOnly[1].replace(/:\s*$/, '').trim();
    } else {
      const text = _stripHtmlTags(inner).trim();
      if (text && currentTitle !== null) {
        currentParagraphs.push(text);
        currentOrderedLines.push({ type: 'paragraph', text });
      }
    }
  }
  flush();
  return sections;
}

// A section is "role-specific" if it needs AI-generated content (has role placeholders
// or is a requirements/description section by title). Otherwise it's boilerplate
// that should be copied verbatim.
function _isRoleSpecific(section) {
  const allText = [section.title, ...section.paragraphs, ...section.bullets].join(' ');
  if (/\(Job [Tt]itle[s]?\)/.test(allText)) return true;
  if (/\bXXX\b/.test(allText)) return true;
  if (/\bBlank\b/.test(allText)) return true;
  if (/\bJob [Aa]rea[s]?\b/.test(allText)) return true;
  if (/we also imagine|we imagine|requirements?|we(?:'re| are) looking for|responsibilities|you will|your role|dine opgaver|vi søger/i.test(section.title)) return true;
  if (!section.paragraphs.length && !section.bullets.length) return true;
  return false;
}

function buildTemplateSection(sections, language) {
  if (!sections || !sections.length) return '';

  const da = language === 'da';
  const lines = [];

  if (da) {
    lines.push('\n━━━ VIRKSOMHEDENS JOBOPSLAGS-SKABELON ━━━\n');
    lines.push('ABSOLUTTE REGLER (tilsidesætter alt ovenfor):');
    lines.push('1. Brug KUN disse sektionstitler i denne nøjagtige rækkefølge — opfind ingen nye, omdøb ingen, spring ingen over.');
    lines.push('2. Skriv overskrifterne PRÆCIS som vist — tilføj ikke kolon, brug ikke store bogstaver, ændr intet.');
    lines.push('3. [GENERER]-sektioner: Skriv nyt indhold baseret på bullets fra rekrutteringsansvarlig. Anvend den psykologiske tilgang fra oven i PROSATEKSTEN — ikke i strukturen.');
    lines.push('4. [KOPIER]-sektioner: Kopiér teksten ORDRET — ingen parafrase, ingen tilføjelser, ingen ændringer.');
    lines.push('5. Bevar ALLE placeholders præcis som vist: (Job Title), XXX, Blank o.l. — udfyld dem ikke.\n');
  } else {
    lines.push('\n━━━ COMPANY JOB POSTING TEMPLATE ━━━\n');
    lines.push('ABSOLUTE RULES (override everything above):');
    lines.push('1. Use ONLY these section headings in this exact order — do not invent new ones, rename any, or skip any.');
    lines.push('2. Write headings EXACTLY as shown — do not add colons, do not capitalise, do not change anything.');
    lines.push('3. [GENERATE] sections: Write fresh content based on the recruiter\'s bullets. Apply the psychological approach from above in the PROSE — not in the structure.');
    lines.push('4. [COPY] sections: Copy the text VERBATIM — no paraphrasing, no additions, no changes.');
    lines.push('5. Preserve ALL placeholder tokens exactly as shown: (Job Title), XXX, Blank, etc. — do not fill them in.\n');
  }

  for (const s of sections) {
    const roleSpecific = _isRoleSpecific(s);
    const tag = roleSpecific ? (da ? '[GENERER]' : '[GENERATE]') : (da ? '[KOPIER]' : '[COPY]');
    lines.push(`─── ${tag} ${s.title}`);
    if (!roleSpecific) {
      // Use orderedLines (preserves document order for interleaved bullet/paragraph patterns
      // like benefit sections where each bullet heading precedes its description paragraph).
      // Fall back to separate paragraphs+bullets for sections parsed without orderedLines.
      if (s.orderedLines && s.orderedLines.length > 0) {
        for (const item of s.orderedLines) {
          lines.push(item.type === 'bullet' ? `• ${item.text}` : item.text);
        }
      } else {
        for (const p of s.paragraphs) lines.push(p);
        for (const b of s.bullets) lines.push(`• ${b}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
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

async function generateJobPosting({
  jobTitle, bullets, language, templateContent, templateHtml,
  location, startDate, employmentType,
  fitCriteria, candidateProfile, jobAnalysis, behaviorPatterns,
  projectId, userId,
}) {
  const promptFile = `jobopslag-${language}.txt`;
  const template = readPrompt(promptFile);
  const bulletsText = bullets.map((b) => `• ${b}`).join('\n');
  // Prefer HTML-based parsing (accurate bold-heading detection) over raw text heuristics
  const templateSections = templateHtml ? parseDocxTemplateFromHtml(templateHtml) : [];
  const templateSection = templateSections.length ? buildTemplateSection(templateSections, language) : '';

  const isDa = language === 'da';
  const contextParts = [
    location       && `${isDa ? 'Lokation'        : 'Location'}: ${location}`,
    startDate      && `${isDa ? 'Startdato'        : 'Start date'}: ${startDate}`,
    employmentType && `${isDa ? 'Ansættelsestype'  : 'Employment type'}: ${employmentType}`,
  ].filter(Boolean);
  const contextLines = contextParts.length ? contextParts.join('\n') : '';

  const sharedRules = readSharedRules(language);

  // Build optional Tier 2 context sections (non-empty only)
  function buildOptionalSection(header, lines) {
    const filtered = lines.filter(Boolean);
    return filtered.length ? `\n${header}\n${filtered.join('\n')}\n` : '';
  }

  let fitCriteriaSection = '';
  if (fitCriteria && typeof fitCriteria === 'object') {
    const parts = [
      fitCriteria.job_fit     && `${isDa ? 'Job-fit'     : 'Job fit'}: ${fitCriteria.job_fit}`,
      fitCriteria.team_fit    && `${isDa ? 'Team-fit'    : 'Team fit'}: ${fitCriteria.team_fit}`,
      fitCriteria.leader_fit  && `${isDa ? 'Leder-fit'   : 'Leader fit'}: ${fitCriteria.leader_fit}`,
      fitCriteria.culture_fit && `${isDa ? 'Kultur-fit'  : 'Culture fit'}: ${fitCriteria.culture_fit}`,
    ].filter(Boolean);
    fitCriteriaSection = buildOptionalSection(isDa ? 'FIT-KRITERIER:' : 'FIT CRITERIA:', parts);
  }

  let candidateProfileSection = '';
  if (Array.isArray(candidateProfile) && candidateProfile.some((b) => b?.trim())) {
    const bullets2 = candidateProfile.filter((b) => b?.trim()).map((b) => `• ${b}`);
    candidateProfileSection = buildOptionalSection(isDa ? 'KANDIDATPROFIL:' : 'CANDIDATE PROFILE:', bullets2);
  }

  let jobAnalysisSection = '';
  if (jobAnalysis && typeof jobAnalysis === 'object') {
    const parts = [
      jobAnalysis.best   && `${isDa ? 'Bedste i rollen'    : 'Best in role'}: ${jobAnalysis.best}`,
      jobAnalysis.worst  && `${isDa ? 'Dårligste i rollen' : 'Worst in role'}: ${jobAnalysis.worst}`,
      jobAnalysis.hidden && `${isDa ? 'Skjulte krav'       : 'Hidden requirement'}: ${jobAnalysis.hidden}`,
    ].filter(Boolean);
    jobAnalysisSection = buildOptionalSection(isDa ? 'JOBANALYSE:' : 'JOB ANALYSIS:', parts);
  }

  let behaviorPatternsSection = '';
  if (Array.isArray(behaviorPatterns) && behaviorPatterns.length) {
    const lines = behaviorPatterns.map((p) => `• ${p.title}: ${p.description}`);
    behaviorPatternsSection = buildOptionalSection(
      isDa ? 'ADFÆRDSMØNSTRE (top 3–4 valgt af rekrutteringsansvarlig):' : 'BEHAVIOUR PATTERNS (top 3–4 selected by hiring manager):',
      lines
    );
  }

  // Pick two different psychology approaches randomly for this generation
  const approaches = APPROACHES[language];
  const [ia, ib] = pickTwoDifferent(approaches.length);
  const variantAApproach = buildApproachBlock(approaches[ia], 'A');
  const variantBApproach = buildApproachBlock(approaches[ib], 'B');

  const prompt = fillTemplate(template, {
    job_title:                  jobTitle,
    bullets:                    bulletsText,
    template_section:           templateSection,
    context_lines:              contextLines,
    shared_content_rules:       sharedRules,
    variant_a_approach:         variantAApproach,
    variant_b_approach:         variantBApproach,
    fit_criteria_section:       fitCriteriaSection,
    candidate_profile_section:  candidateProfileSection,
    job_analysis_section:       jobAnalysisSection,
    behavior_patterns_section:  behaviorPatternsSection,
  });

  const text = await callClaude(prompt, promptFile, projectId, userId, 2);

  if (isRefusal(text)) {
    const err = new Error('content_refused');
    err.status = 422;
    throw err;
  }

  return extractVariants(text);
}

// ── Tier 2: fit criteria ──────────────────────────────────────────────────────

async function generateFitCriteria({ jobTitle, department, teamComposition, language, projectId, userId, bullets = [] }) {
  const promptFile = `fit-criteria-${language}.txt`;
  const template = readPrompt(promptFile);
  const noInfo = language === 'da' ? '(ikke angivet)' : '(not specified)';
  const filledBullets = bullets.filter((b) => b && b.trim());
  const bulletsText = filledBullets.length > 0
    ? filledBullets.map((b) => `• ${b}`).join('\n')
    : noInfo;
  const prompt = fillTemplate(template, {
    job_title: jobTitle,
    department: department || noInfo,
    team_composition: teamComposition || noInfo,
    bullets_text: bulletsText,
  });

  const text = await callClaude(prompt, promptFile, projectId, userId, 3);

  // Extract JSON from response — strip any markdown fences if present
  const cleaned = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid fit criteria response');

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    job_fit: parsed.job_fit || '',
    team_fit: parsed.team_fit || '',
    leader_fit: parsed.leader_fit || '',
    culture_fit: parsed.culture_fit || '',
  };
}

// ── Tier 2: job analysis answer challenge ─────────────────────────────────────

const JOB_ANALYSIS_QUESTIONS = {
  da: {
    best:   'Tænk på den bedste person du nogensinde har set i en tilsvarende rolle. Hvad gjorde de konkret i hverdagen?',
    worst:  'Hvad gjorde den person der fejlede i denne type rolle konkret forkert?',
    hidden: 'Hvad er det krav der ikke er skrevet i opslaget, men som afgør om nogen lykkes i rollen?',
  },
  en: {
    best:   'Think of the best person you\'ve seen in a similar role. What did they specifically do day-to-day?',
    worst:  'What did the person who failed in this type of role specifically do wrong?',
    hidden: 'What is the requirement that isn\'t written in the job posting, but determines whether someone succeeds in the role?',
  },
};

async function challengeJobAnalysisAnswer({ questionType, answer, language, projectId, userId }) {
  const promptFile = `job-analysis-challenge-${language}.txt`;
  const template = readPrompt(promptFile);
  const lang = language === 'en' ? 'en' : 'da';
  const question = JOB_ANALYSIS_QUESTIONS[lang][questionType] || '';

  const prompt = fillTemplate(template, {
    question_type: questionType,
    question,
    answer,
  });

  const text = await callClaude(prompt, promptFile, projectId, userId, 5);

  const cleaned = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { challenge: null };

  const parsed = JSON.parse(jsonMatch[0]);
  if (parsed.is_concrete) return { challenge: null };
  return { challenge: parsed.challenge || null, probe: parsed.probe || null };
}

// ── Tier 2: behavior patterns ─────────────────────────────────────────────────

async function generateBehaviorPatterns({ fitCriteria, candidateProfile, jobAnalysis, language, projectId, userId }) {
  const promptFile = `behavior-patterns-${language}.txt`;
  const template = readPrompt(promptFile);
  const isDa = language === 'da';
  const noInfo = isDa ? '(ikke angivet)' : '(not specified)';

  const fitParts = [
    fitCriteria.job_fit     ? `${isDa ? 'Job-fit'     : 'Job fit'}: ${fitCriteria.job_fit}`     : null,
    fitCriteria.team_fit    ? `${isDa ? 'Team-fit'    : 'Team fit'}: ${fitCriteria.team_fit}`    : null,
    fitCriteria.leader_fit  ? `${isDa ? 'Leder-fit'   : 'Leader fit'}: ${fitCriteria.leader_fit}` : null,
    fitCriteria.culture_fit ? `${isDa ? 'Kultur-fit'  : 'Culture fit'}: ${fitCriteria.culture_fit}` : null,
  ].filter(Boolean);
  const fitText = fitParts.length ? fitParts.join('\n\n') : noInfo;

  const profileBullets = Array.isArray(candidateProfile) ? candidateProfile.filter((b) => b?.trim()) : [];
  const profileText = profileBullets.length ? profileBullets.map((b) => `• ${b}`).join('\n') : noInfo;

  const analysisParts = [
    jobAnalysis.best   ? `${isDa ? 'Den bedste i rollen'    : 'Best in the role'}: ${jobAnalysis.best}`     : null,
    jobAnalysis.worst  ? `${isDa ? 'Den dårligste i rollen' : 'Worst in the role'}: ${jobAnalysis.worst}`   : null,
    jobAnalysis.hidden ? `${isDa ? 'Det skjulte krav'       : 'Hidden requirement'}: ${jobAnalysis.hidden}` : null,
  ].filter(Boolean);
  const analysisText = analysisParts.length ? analysisParts.join('\n\n') : noInfo;

  const prompt = fillTemplate(template, {
    fit_criteria:      fitText,
    candidate_profile: profileText,
    job_analysis:      analysisText,
  });

  const text = await callClaude(prompt, promptFile, projectId, userId, 6);

  const cleaned = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid behavior patterns response');

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed.patterns) || parsed.patterns.length < 5) {
    throw new Error('Expected behavior patterns array');
  }

  return parsed.patterns.slice(0, 8).map((p) => ({
    title:       String(p.title || ''),
    description: String(p.description || ''),
  }));
}

// ── Tier 2: candidate profile ─────────────────────────────────────────────────

async function generateCandidateProfile({
  jobTitle, bullets, fitCriteria, candidateProfile, jobAnalysis, behaviorPatterns, finalJobPosting,
  language, projectId, userId,
}) {
  const promptFile = `kandidatprofil-${language}.txt`;
  const template = readPrompt(promptFile);
  const isDa = language === 'da';
  const noInfo = isDa ? '(ikke angivet)' : '(not specified)';

  const bulletsText = (bullets || []).filter(Boolean).map((b) => `• ${b}`).join('\n') || noInfo;

  function buildSection(header, lines) {
    const filtered = lines.filter(Boolean);
    return filtered.length ? `\n${header}\n${filtered.join('\n')}\n` : '';
  }

  const fitParts = [
    fitCriteria?.job_fit     && `${isDa ? 'Job-fit'    : 'Job fit'}: ${fitCriteria.job_fit}`,
    fitCriteria?.team_fit    && `${isDa ? 'Team-fit'   : 'Team fit'}: ${fitCriteria.team_fit}`,
    fitCriteria?.leader_fit  && `${isDa ? 'Leder-fit'  : 'Leader fit'}: ${fitCriteria.leader_fit}`,
    fitCriteria?.culture_fit && `${isDa ? 'Kultur-fit' : 'Culture fit'}: ${fitCriteria.culture_fit}`,
  ].filter(Boolean);
  const fitSection = buildSection(isDa ? 'FIT-KRITERIER:' : 'FIT CRITERIA:', fitParts);

  const profileBullets = Array.isArray(candidateProfile) ? candidateProfile.filter((b) => b?.trim()) : [];
  const profileSection = buildSection(
    isDa ? 'KANDIDATPROFIL (krav og dimensioner):' : 'CANDIDATE PROFILE (requirements and dimensions):',
    profileBullets.map((b) => `• ${b}`)
  );

  const analysisParts = [
    jobAnalysis?.best   && `${isDa ? 'Bedste i rollen'    : 'Best in role'}: ${jobAnalysis.best}`,
    jobAnalysis?.worst  && `${isDa ? 'Dårligste i rollen' : 'Worst in role'}: ${jobAnalysis.worst}`,
    jobAnalysis?.hidden && `${isDa ? 'Skjulte krav'       : 'Hidden requirement'}: ${jobAnalysis.hidden}`,
  ].filter(Boolean);
  const analysisSection = buildSection(isDa ? 'JOBANALYSE:' : 'JOB ANALYSIS:', analysisParts);

  const patternLines = Array.isArray(behaviorPatterns) && behaviorPatterns.length
    ? behaviorPatterns.map((p) => `• ${p.title}: ${p.description}`)
    : [];
  const patternsSection = buildSection(
    isDa ? 'VALGTE ADFÆRDSMØNSTRE:' : 'SELECTED BEHAVIOUR PATTERNS:',
    patternLines
  );

  const postingSection = finalJobPosting
    ? `\n${isDa ? 'GENERERET JOBOPSLAG (variant A):' : 'GENERATED JOB POSTING (variant A):'}\n${finalJobPosting.slice(0, 2000)}\n`
    : '';

  const sharedRules = readSharedRules(language);

  const prompt = fillTemplate(template, {
    job_title:                          jobTitle,
    role_bullets:                       bulletsText,
    fit_criteria_section:               fitSection,
    candidate_profile_bullets_section:  profileSection,
    job_analysis_section:               analysisSection,
    selected_behavior_patterns_section: patternsSection,
    final_job_posting_section:          postingSection,
    shared_content_rules:               sharedRules,
  });

  const text = await callClaude(prompt, promptFile, projectId, userId, 8);

  if (isRefusal(text)) {
    const err = new Error('content_refused');
    err.status = 422;
    throw err;
  }

  return text.trim();
}

// ── Tier 2: interview guide ───────────────────────────────────────────────────

async function generateInterviewGuide({
  behaviorPatterns, candidateProfile, language, projectId, userId,
}) {
  const promptFile = `interviewguide-${language}.txt`;
  const template = readPrompt(promptFile);
  const isDa = language === 'da';
  const noInfo = isDa ? '(ikke angivet)' : '(not specified)';

  const patternLines = Array.isArray(behaviorPatterns) && behaviorPatterns.length
    ? behaviorPatterns.map((p) => `• ${p.title}: ${p.description}`)
    : [noInfo];
  const patternsText = patternLines.join('\n');

  const profileBullets = Array.isArray(candidateProfile) ? candidateProfile.filter((b) => b?.trim()) : [];
  const profileText = profileBullets.length ? profileBullets.map((b) => `• ${b}`).join('\n') : noInfo;

  const sharedRules = readSharedRules(language);

  const prompt = fillTemplate(template, {
    selected_behavior_patterns: patternsText,
    candidate_profile_bullets:  profileText,
    shared_content_rules:       sharedRules,
  });

  const text = await callClaude(prompt, promptFile, projectId, userId, 8);

  const cleaned = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid interview guide response');

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed.guide) || parsed.guide.length < 1) {
    throw new Error('Expected interview guide array');
  }

  return parsed.guide.map((item) => ({
    pattern_title: String(item.pattern_title || ''),
    question:      String(item.question || ''),
    probe:         String(item.probe || ''),
    rubric: {
      '1': String(item.rubric?.['1'] || ''),
      '2': String(item.rubric?.['2'] || ''),
      '3': String(item.rubric?.['3'] || ''),
      '4': String(item.rubric?.['4'] || ''),
    },
  }));
}

// ── Freetext → bullets parser ─────────────────────────────────────────────────

async function parseBulletsFromFreetext({ freetext, language, projectId, userId }) {
  // Use the DA prompt for both languages — it auto-detects input language and
  // mirrors it in bullet output. The EN prompt is provided for symmetry.
  const lang = language === 'en' ? 'en' : 'da';
  const promptFile = `freetext-to-bullets-${lang}.txt`;
  const template = readPrompt(promptFile);
  const prompt = fillTemplate(template, { freetext: freetext.slice(0, 4000) });

  const text = await callClaude(prompt, promptFile, projectId, userId, null);

  // Refusal → graceful empty array. Uses REFUSAL_PATTERNS directly rather than
  // isRefusal(): its <200-char heuristic assumes job-posting-length responses
  // and would misfire on a short-but-valid bullets array.
  if (REFUSAL_PATTERNS.some((p) => p.test(text))) return [];

  const cleaned = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((b) => String(b).trim())
    .filter(Boolean)
    .slice(0, 15);
}

module.exports = { generateJobPosting, generateFitCriteria, challengeJobAnalysisAnswer, generateBehaviorPatterns, generateCandidateProfile, generateInterviewGuide, parseBulletsFromFreetext };
