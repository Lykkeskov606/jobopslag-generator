const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const db = require('../db');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';
// Approx cost: $3/MTok input, $15/MTok output → in cents per token
const COST_INPUT_CENTS_PER_TOKEN = 0.0003;
const COST_OUTPUT_CENTS_PER_TOKEN = 0.0015;

function readPrompt(filename) {
  return fs.readFileSync(path.join(__dirname, '../../prompts', filename), 'utf8');
}

function readSharedRules(language) {
  const file = `shared-content-rules-${language}.txt`;
  return fs.readFileSync(path.join(__dirname, '../../prompts', file), 'utf8');
}

function fillTemplate(template, vars) {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v ?? ''),
    template
  );
}

function extractVariants(text) {
  const a = text.match(/<variant_a>([\s\S]*?)<\/variant_a>/i);
  const b = text.match(/<variant_b>([\s\S]*?)<\/variant_b>/i);
  if (a && b) {
    return { variant_a: a[1].trim(), variant_b: b[1].trim() };
  }
  // Fallback: split roughly in half if tags are missing
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

async function generateJobPosting({ jobTitle, bullets, language, templateContent, location, startDate, employmentType, projectId, userId }) {
  const promptFile = `jobopslag-${language}.txt`;
  const template = readPrompt(promptFile);
  const bulletsText = bullets.map((b) => `• ${b}`).join('\n');
  const templateSection = templateContent
    ? `\n${language === 'da' ? 'VIRKSOMHEDENS SKABELON/TONE' : 'COMPANY TEMPLATE/TONE'}:\n${templateContent}`
    : '';

  // Build context lines — only include fields that have a value
  const isDa = language === 'da';
  const contextParts = [
    location       && `${isDa ? 'Lokation'          : 'Location'}: ${location}`,
    startDate      && `${isDa ? 'Startdato'         : 'Start date'}: ${startDate}`,
    employmentType && `${isDa ? 'Ansættelsestype'   : 'Employment type'}: ${employmentType}`,
  ].filter(Boolean);
  const contextLines = contextParts.length ? contextParts.join('\n') : '';

  const sharedRules = readSharedRules(language);

  const prompt = fillTemplate(template, {
    job_title: jobTitle,
    bullets: bulletsText,
    template_section: templateSection,
    context_lines: contextLines,
    shared_content_rules: sharedRules,
  });

  const text = await callClaude(prompt, promptFile, projectId, userId, 2);
  return extractVariants(text);
}

module.exports = { generateJobPosting };
