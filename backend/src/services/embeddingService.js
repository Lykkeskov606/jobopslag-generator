const { OpenAI } = require('openai');

// OpenAI text-embedding-3-small: 1536 dimensions, matches rag_sources.embedding column.
// If OPENAI_API_KEY is not set the service returns null and all callers degrade gracefully.

let _client = null;
function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

/**
 * Returns a 1536-float embedding for `text`, or null on failure.
 * Never throws — callers must handle null as "embedding unavailable".
 */
async function getEmbedding(text) {
  try {
    const client = getClient();
    if (!client) return null;
    const resp = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000), // model limit is 8191 tokens
    });
    return resp.data[0].embedding;
  } catch {
    return null;
  }
}

module.exports = { getEmbedding };
