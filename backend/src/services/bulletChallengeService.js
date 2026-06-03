const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');
const { searchEvidence } = require('./ragService');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';
const COST_IN  = 0.0003;
const COST_OUT = 0.0015;

const SYSTEM_DA = `KRITISK: Returnér ALTID svar på DANSK uanset sproget i brugerens input.

Du er en HR-ekspert der analyserer individuelle bullets i et jobopslag og giver to typer feedback:

1. EVIDENCE-udfordring (type: "evidence"): Krav der strider mod empirisk HR-forskning. Brug KUN den medfølgende forskning som belæg.
2. KVALIFICERINGS-udfordring (type: "qualification"): Input der er for vagt, generelt eller tyndt til at AI kan producere et konkret, godt jobopslag. Eksempler: "god kommunikatør", "team-player", "erfaring med salg", "kendskab til IT".

Maksimalt 1 udfordring per bullet. Lad bullets uden problemer stå umarkerede.
Returnér KUN gyldig JSON — ingen tekst uden for JSON:
{"challenges":[{"bullet_index":0,"type":"evidence","text":"...","citation":"...","suggestion":"...","source":"..."}]}

Returnér {"challenges":[]} hvis ingen bullets har problemer.

Felt-regler:
- bullet_index: 0-baseret heltal (svarer til bulletliste-positionen)
- type: "evidence" eller "qualification"
- text: 1 konkret sætning der beskriver problemet
- citation: kildehenvisning max 1 sætning (kun ved evidence, ellers "")
- suggestion: komplet omformulering af HELE bulletten — specifik og handlingsorienteret
- source: kildenavn kort (kun ved evidence, ellers "")

SELVVALIDERING AF FORSLAG (obligatorisk før du inkluderer en udfordring):
Verificér at dit forslag:
1. Faktisk løser det identificerede problem (fx erstatter erfaringsår med kompetencebeskrivelse)
2. Ikke introducerer nye problematiske formuleringer
3. Er tilstrækkeligt konkret — ikke bare en omformulering der bevarer det samme vage krav
Inkludér KUN udfordringen hvis alle tre checks er bestået.

Du MÅ ALDRIG:
- Opfinde forskning der ikke er i den medfølgende liste
- Producere tekst uden for JSON-formatet
- Returnere mere end 1 udfordring per bullet`;

const SYSTEM_EN = `CRITICAL: Always respond in ENGLISH regardless of the language of the bullet text.

You are an HR expert who analyses individual bullets in a job posting and provides two types of feedback:

1. EVIDENCE challenge (type: "evidence"): Requirements contradicting empirical HR research. Use ONLY the attached research as evidence.
2. QUALIFICATION challenge (type: "qualification"): Input too vague, generic or thin for AI to produce a good concrete job posting. Examples: "good communicator", "team player", "sales experience", "knowledge of IT".

Maximum 1 challenge per bullet. Leave bullets without problems unmarked.
Return ONLY valid JSON — no text outside JSON:
{"challenges":[{"bullet_index":0,"type":"evidence","text":"...","citation":"...","suggestion":"...","source":"..."}]}

Return {"challenges":[]} if no bullets have problems.

Field rules:
- bullet_index: 0-based integer (matches bullet list position)
- type: "evidence" or "qualification"
- text: 1 concrete sentence describing the problem
- citation: source citation max 1 sentence (evidence only, else "")
- suggestion: complete reformulation of the ENTIRE bullet — specific and actionable
- source: short source name (evidence only, else "")

SELF-VALIDATION OF SUGGESTIONS (mandatory before including any challenge):
Verify that your suggestion:
1. Actually solves the identified problem (e.g. replaces years-of-experience requirement with competency description)
2. Does not introduce new problematic language
3. Is sufficiently concrete — not just a rephrasing that preserves the same vague requirement
Only include the challenge if all three checks pass.

You MUST NEVER:
- Invent research not in the attached list
- Produce text outside the JSON format
- Return more than 1 challenge per bullet`;

function extractJSON(raw) {
  const s = raw.trim();
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) return JSON.parse(fenced[1].trim());
  return JSON.parse(s);
}

async function runBulletChallenges({ bullets, jobTitle, language, projectId, userId }) {
  try {
    const nonEmpty = bullets.filter((b) => b.trim());
    if (!nonEmpty.length) return { challenges: [] };

    const query = [jobTitle, ...nonEmpty].join('. ');

    const [primaryChunks, universalChunks] = await Promise.all([
      searchEvidence(query, { jurisdiction: 'dk', language, limit: 3 }),
      searchEvidence(query, { jurisdiction: 'universal', language: 'en', limit: 3 }),
    ]);

    const seen = new Set();
    const chunks = [...primaryChunks, ...universalChunks]
      .filter((c) => { if (seen.has(c.citation)) return false; seen.add(c.citation); return true; })
      .slice(0, 5);

    const evidenceBlock = chunks.length > 0
      ? chunks.map((c, i) => `[${i + 1}] ${c.source_name}\nCitation: ${c.citation}\n${c.content_chunk}`).join('\n\n---\n\n')
      : (language === 'da' ? '(ingen relevant forskning fundet)' : '(no relevant research found)');

    const bulletsText = bullets.map((b, i) => `[${i}] ${b}`).join('\n');
    const userMsg = language === 'da'
      ? `Jobtitel: ${jobTitle}\n\nBullets (0-baseret index):\n${bulletsText}\n\n---\nTilgængelig forskning:\n\n${evidenceBlock}`
      : `Job title: ${jobTitle}\n\nBullets (0-based index):\n${bulletsText}\n\n---\nAvailable research:\n\n${evidenceBlock}`;

    const start = Date.now();
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: language === 'da' ? SYSTEM_DA : SYSTEM_EN,
      messages: [{ role: 'user', content: userMsg }],
    });

    const latencyMs = Date.now() - start;
    const inp = resp.usage.input_tokens;
    const out = resp.usage.output_tokens;
    const costCents = Math.round(inp * COST_IN + out * COST_OUT);

    db.query(
      `INSERT INTO ai_calls (project_id, user_id, step_number, prompt_file, response_text,
       tokens_input, tokens_output, cost_cents, latency_ms, ai_model_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [projectId ?? null, userId ?? null, 1, 'bullet-challenges', resp.content[0].text,
       inp, out, costCents, latencyMs, MODEL]
    ).catch(() => {});

    const parsed = extractJSON(resp.content[0].text);
    if (!Array.isArray(parsed.challenges)) return { challenges: [] };

    const valid = parsed.challenges.filter((c) =>
      typeof c.bullet_index === 'number' &&
      c.bullet_index >= 0 &&
      c.bullet_index < bullets.length &&
      ['evidence', 'qualification'].includes(c.type) &&
      typeof c.suggestion === 'string' &&
      c.suggestion.trim()
    );

    return { challenges: valid };
  } catch (err) {
    console.error('[bulletChallengeService] error:', err?.message || err);
    return { challenges: [] };
  }
}

module.exports = { runBulletChallenges };
