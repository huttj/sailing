import { readFileSync, writeFileSync } from 'fs';
import OpenAI from 'openai';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const DATA_DIR = `${ROOT}/public/data`;
const BATCH_SIZE = 100;
const MODEL = 'text-embedding-3-small';

// ── Load data ────────────────────────────────────────────────────────
const ideas = JSON.parse(readFileSync(`${DATA_DIR}/ideas-raw.json`, 'utf-8'));

console.log(`Loaded ${ideas.length} ideas`);

// ── Build embedding inputs ───────────────────────────────────────────
const inputs = ideas.map(idea => idea.text_for_embedding);

// ── Initialize OpenAI client ─────────────────────────────────────────
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Error: OPENAI_API_KEY environment variable is not set');
  process.exit(1);
}

const openai = new OpenAI({ apiKey });

// ── Embed in batches ─────────────────────────────────────────────────
const results = new Array(ideas.length);
const totalBatches = Math.ceil(ideas.length / BATCH_SIZE);

console.log(`Embedding ${ideas.length} ideas in ${totalBatches} batches of up to ${BATCH_SIZE}...`);

for (let i = 0; i < ideas.length; i += BATCH_SIZE) {
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  const batchInputs = inputs.slice(i, i + BATCH_SIZE);
  const batchIdeas = ideas.slice(i, i + BATCH_SIZE);

  console.log(`  Batch ${batchNum}/${totalBatches} (${batchInputs.length} items)...`);
  const startTime = Date.now();

  const response = await openai.embeddings.create({
    model: MODEL,
    input: batchInputs,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`    Done in ${elapsed}s`);

  for (let j = 0; j < response.data.length; j++) {
    results[i + j] = {
      id: batchIdeas[j].id,
      embedding: response.data[j].embedding,
    };
  }
}

// ── Write output ─────────────────────────────────────────────────────
writeFileSync(`${DATA_DIR}/embeddings.json`, JSON.stringify(results));
console.log(`Wrote ${DATA_DIR}/embeddings.json (${results.length} embeddings)`);
