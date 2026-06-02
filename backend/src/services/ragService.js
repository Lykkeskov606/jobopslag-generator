const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');
const { getEmbedding } = require('./embeddingService');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';
const COST_INPUT_CENTS_PER_TOKEN  = 0.0003;
const COST_OUTPUT_CENTS_PER_TOKEN = 0.0015;

// ── Vector similarity search ──────────────────────────────────────────────────

/**
 * Searches rag_sources by cosine similarity. Returns top `limit` chunks.
 * Filters by jurisdiction ('dk' or 'universal') and language.
 * Falls back to empty array on any failure (graceful degradation per spec §8).
 */
async function searchEvidence(query, { jurisdiction = 'dk', language = 'da', limit = 4 } = {}) {
  try {
    const embedding = await getEmbedding(query);
    if (!embedding) return [];

    const { rows } = await db.query(
      `SELECT source_name, citation, content_chunk,
              1 - (embedding <=> $1::vector) AS similarity
       FROM rag_sources
       WHERE active = true
         AND embedding IS NOT NULL
         AND ($2::text = ANY(jurisdictions) OR 'universal' = ANY(jurisdictions))
         AND $3::text = ANY(languages)
       ORDER BY similarity DESC
       LIMIT $4`,
      [JSON.stringify(embedding), jurisdiction, language, limit]
    );
    return rows;
  } catch {
    return [];
  }
}

// ── Evidence challenge via Claude ─────────────────────────────────────────────

const SYSTEM_DA = `Du er en HR-ekspert der analyserer jobkrav og giver evidensbaserede udfordringer baseret på vedlagt forskning.

Du SKAL:
- Basere udfordringer UDELUKKENDE på den medfølgende forskning
- Svare på dansk
- Returnere KUN gyldig JSON: {"challenges":[{"text":"...","source":"...","citation":"..."}]}
- Maksimalt 3 udfordringer
- Holde hver udfordring under 2 sætninger, konkret og handlingsrettet
- Returnere {"challenges":[]} hvis ingen udfordringer er relevante

Du MÅ ALDRIG:
- Opfinde forskning eller citere kilder der ikke er i den medfølgende liste
- Blokere generering — dette er kun rådgivende
- Producere tekst uden for JSON-formatet`;

const SYSTEM_EN = `You are an HR expert who analyses job requirements and provides evidence-based challenges using attached research.

You MUST:
- Base challenges ONLY on the attached research
- Respond in English
- Return ONLY valid JSON: {"challenges":[{"text":"...","source":"...","citation":"..."}]}
- Maximum 3 challenges
- Keep each challenge under 2 sentences, concrete and actionable
- Return {"challenges":[]} if no challenges are relevant

You MUST NEVER:
- Invent research or cite sources not in the attached list
- Block generation — this is advisory only
- Produce text outside the JSON format`;

/**
 * Main Fase-3 entry point.
 * Retrieves relevant evidence, asks Claude to formulate challenges.
 * Always returns {challenges:[]} on any error — never throws.
 *
 * @param {object} opts
 * @param {string[]} opts.bullets
 * @param {string}   opts.jobTitle
 * @param {'da'|'en'} opts.language
 * @param {string}   opts.projectId
 * @param {string}   opts.userId
 * @returns {Promise<{challenges: Array<{text:string,source:string,citation:string}>}>}
 */
async function runEvidenceChallenge({ bullets, jobTitle, language, projectId, userId }) {
  try {
    const query = [jobTitle, ...bullets].join('. ');
    const jurisdiction = 'dk';

    // Retrieve semantically relevant evidence chunks
    const [primaryChunks, universalChunks] = await Promise.all([
      searchEvidence(query, { jurisdiction, language, limit: 3 }),
      searchEvidence(query, { jurisdiction: 'universal', language: 'en', limit: 3 }),
    ]);

    // Combine, deduplicate by citation, keep top 5
    const seen = new Set();
    const chunks = [...primaryChunks, ...universalChunks].filter((c) => {
      if (seen.has(c.citation)) return false;
      seen.add(c.citation);
      return true;
    }).slice(0, 5);

    if (chunks.length === 0) return { challenges: [] };

    const evidenceBlock = chunks
      .map((c, i) => `[${i + 1}] ${c.source_name}\nCitation: ${c.citation}\n${c.content_chunk}`)
      .join('\n\n---\n\n');

    const bulletsText = bullets.map((b) => `• ${b}`).join('\n');
    const userMessage =
      language === 'da'
        ? `Jobtitel: ${jobTitle}\n\nKrav og bullets:\n${bulletsText}\n\n---\nTilgængelig forskning:\n\n${evidenceBlock}`
        : `Job title: ${jobTitle}\n\nRequirements and bullets:\n${bulletsText}\n\n---\nAvailable research:\n\n${evidenceBlock}`;

    const start = Date.now();
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: language === 'da' ? SYSTEM_DA : SYSTEM_EN,
      messages: [{ role: 'user', content: userMessage }],
    });

    const latencyMs = Date.now() - start;
    const inp = resp.usage.input_tokens;
    const out = resp.usage.output_tokens;
    const costCents = Math.round(inp * COST_INPUT_CENTS_PER_TOKEN + out * COST_OUTPUT_CENTS_PER_TOKEN);

    db.query(
      `INSERT INTO ai_calls
       (project_id, user_id, step_number, prompt_file, response_text,
        tokens_input, tokens_output, cost_cents, latency_ms, ai_model_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [projectId ?? null, userId ?? null, 1, 'evidence-challenge', resp.content[0].text,
       inp, out, costCents, latencyMs, MODEL]
    ).catch(() => {});

    const parsed = JSON.parse(resp.content[0].text);
    if (!Array.isArray(parsed.challenges)) return { challenges: [] };
    return { challenges: parsed.challenges.slice(0, 3) };
  } catch {
    return { challenges: [] };
  }
}

module.exports = { searchEvidence, runEvidenceChallenge };
