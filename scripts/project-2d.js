import { readFileSync, writeFileSync } from 'fs';
import { UMAP } from 'umap-js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const DATA_DIR = `${ROOT}/public/data`;

const WORLD_MIN = -5000;
const WORLD_MAX = 5000;
const JITTER_RADIUS = 30;
const PROXIMITY_THRESHOLD = 20;

// ── Load data ────────────────────────────────────────────────────────
const ideasRaw = JSON.parse(readFileSync(`${DATA_DIR}/ideas-raw.json`, 'utf-8'));
const embeddings = JSON.parse(readFileSync(`${DATA_DIR}/embeddings.json`, 'utf-8'));

console.log(`Loaded ${ideasRaw.length} ideas and ${embeddings.length} embeddings`);

// Build embedding lookup by id
const embeddingById = {};
for (const e of embeddings) {
  embeddingById[e.id] = e.embedding;
}

// Align embeddings to idea order
const vectors = ideasRaw.map(idea => {
  const emb = embeddingById[idea.id];
  if (!emb) {
    console.warn(`Warning: no embedding found for idea ${idea.id}`);
    return new Array(1536).fill(0);
  }
  return emb;
});

// ── Run UMAP ─────────────────────────────────────────────────────────
console.log('Running UMAP projection...');
const startTime = Date.now();

const umap = new UMAP({
  nNeighbors: 25,
  minDist: 0.05,
  nComponents: 2,
});

const projection = umap.fit(vectors);

const umapElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`UMAP completed in ${umapElapsed}s`);

// ── Normalize to world coordinates ───────────────────────────────────
let minX = Infinity, maxX = -Infinity;
let minY = Infinity, maxY = -Infinity;

for (const [x, y] of projection) {
  if (x < minX) minX = x;
  if (x > maxX) maxX = x;
  if (y < minY) minY = y;
  if (y > maxY) maxY = y;
}

const rangeX = maxX - minX || 1;
const rangeY = maxY - minY || 1;

const positions = projection.map(([x, y]) => ({
  x: WORLD_MIN + ((x - minX) / rangeX) * (WORLD_MAX - WORLD_MIN),
  y: WORLD_MIN + ((y - minY) / rangeY) * (WORLD_MAX - WORLD_MIN),
}));

// ── Jitter same-post ideas that are too close ────────────────────────
const postIdeaIndices = {};
for (let i = 0; i < ideasRaw.length; i++) {
  const pid = ideasRaw[i].post_id;
  if (!postIdeaIndices[pid]) postIdeaIndices[pid] = [];
  postIdeaIndices[pid].push(i);
}

for (const indices of Object.values(postIdeaIndices)) {
  if (indices.length < 2) continue;
  for (let a = 0; a < indices.length; a++) {
    for (let b = a + 1; b < indices.length; b++) {
      const ia = indices[a];
      const ib = indices[b];
      const dx = positions[ia].x - positions[ib].x;
      const dy = positions[ia].y - positions[ib].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < PROXIMITY_THRESHOLD) {
        positions[ia].x += (Math.random() - 0.5) * 2 * JITTER_RADIUS;
        positions[ia].y += (Math.random() - 0.5) * 2 * JITTER_RADIUS;
        positions[ib].x += (Math.random() - 0.5) * 2 * JITTER_RADIUS;
        positions[ib].y += (Math.random() - 0.5) * 2 * JITTER_RADIUS;
      }
    }
  }
}

// ── Build ideas.json output ──────────────────────────────────────────
const ideas = ideasRaw.map((idea, i) => ({
  id: idea.id,
  post_id: idea.post_id,
  topic: idea.topic,
  summary: idea.summary,
  quote: idea.quote,
  x: Math.round(positions[i].x * 100) / 100,
  y: Math.round(positions[i].y * 100) / 100,
}));

// ── Compute topic centroids → topics.json ────────────────────────────
const topicAccum = {};
for (const idea of ideas) {
  if (!topicAccum[idea.topic]) {
    topicAccum[idea.topic] = { sumX: 0, sumY: 0, count: 0 };
  }
  topicAccum[idea.topic].sumX += idea.x;
  topicAccum[idea.topic].sumY += idea.y;
  topicAccum[idea.topic].count++;
}

const topicsOutput = Object.entries(topicAccum).map(([name, acc]) => ({
  name,
  x: Math.round((acc.sumX / acc.count) * 100) / 100,
  y: Math.round((acc.sumY / acc.count) * 100) / 100,
  count: acc.count,
}));

// Sort by count descending
topicsOutput.sort((a, b) => b.count - a.count);

// ── Write outputs ────────────────────────────────────────────────────
writeFileSync(`${DATA_DIR}/ideas.json`, JSON.stringify(ideas, null, 2));
console.log(`Wrote ${DATA_DIR}/ideas.json (${ideas.length} ideas with 2D positions)`);

writeFileSync(`${DATA_DIR}/topics.json`, JSON.stringify(topicsOutput, null, 2));
console.log(`Wrote ${DATA_DIR}/topics.json (${topicsOutput.length} topics with centroids)`);
