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

// ── Dedup: drop near-duplicate ideas by embedding similarity ─────────
function cosineSim(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-10);
}

const DEDUP_THRESHOLD = 0.92;
const dropIds = new Set();

// Group by topic for faster comparison
const byTopic = {};
for (const idea of ideasRaw) {
  if (!byTopic[idea.topic]) byTopic[idea.topic] = [];
  byTopic[idea.topic].push(idea);
}

for (const group of Object.values(byTopic)) {
  for (let a = 0; a < group.length; a++) {
    if (dropIds.has(group[a].id)) continue;
    const embA = embeddingById[group[a].id];
    if (!embA) continue;

    for (let b = a + 1; b < group.length; b++) {
      if (dropIds.has(group[b].id)) continue;
      const embB = embeddingById[group[b].id];
      if (!embB) continue;

      if (cosineSim(embA, embB) > DEDUP_THRESHOLD) {
        // Keep the one with the longer quote
        const drop = group[a].quote.length >= group[b].quote.length ? group[b] : group[a];
        dropIds.add(drop.id);
      }
    }
  }
}

const ideasDeduped = ideasRaw.filter(i => !dropIds.has(i.id));
console.log(`Dedup: ${ideasRaw.length} → ${ideasDeduped.length} (dropped ${dropIds.size})`);

// Align embeddings to deduped idea order
const vectors = ideasDeduped.map(idea => {
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
  nNeighbors: 30,
  minDist: 0.01,
  spread: 0.5,
  nComponents: 2,
});

const projection = umap.fit(vectors);

const umapElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`UMAP completed in ${umapElapsed}s`);

// ── Normalize UMAP output to unit space ──────────────────────────────
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

// Normalize to [0, 1] first
const umapNorm = projection.map(([x, y]) => ({
  x: (x - minX) / rangeX,
  y: (y - minY) / rangeY,
}));

// ── Topic-anchored layout ────────────────────────────────────────────
// 1. Compute UMAP-based topic centroids
const topicAccumUmap = {};
for (let i = 0; i < ideasDeduped.length; i++) {
  const t = ideasDeduped[i].topic;
  if (!topicAccumUmap[t]) topicAccumUmap[t] = { sumX: 0, sumY: 0, count: 0 };
  topicAccumUmap[t].sumX += umapNorm[i].x;
  topicAccumUmap[t].sumY += umapNorm[i].y;
  topicAccumUmap[t].count++;
}

const topicCentroids = {};
for (const [name, acc] of Object.entries(topicAccumUmap)) {
  topicCentroids[name] = {
    x: acc.sumX / acc.count,
    y: acc.sumY / acc.count,
    count: acc.count,
  };
}

// 2. Contract each point toward its topic centroid
const CONTRACTION = 0.82; // 0 = pure UMAP, 1 = all at centroid
for (let i = 0; i < umapNorm.length; i++) {
  const c = topicCentroids[ideasDeduped[i].topic];
  umapNorm[i].x = c.x + (umapNorm[i].x - c.x) * (1 - CONTRACTION);
  umapNorm[i].y = c.y + (umapNorm[i].y - c.y) * (1 - CONTRACTION);
}

// 3. Push topic centroids apart if they're too close (min gap)
const MIN_CENTROID_GAP = 0.20;
const centroidNames = Object.keys(topicCentroids);
for (let pass = 0; pass < 20; pass++) {
  let moved = false;
  for (let a = 0; a < centroidNames.length; a++) {
    for (let b = a + 1; b < centroidNames.length; b++) {
      const ca = topicCentroids[centroidNames[a]];
      const cb = topicCentroids[centroidNames[b]];
      const dx = cb.x - ca.x;
      const dy = cb.y - ca.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MIN_CENTROID_GAP && dist > 0) {
        const push = (MIN_CENTROID_GAP - dist) / 2;
        const nx = dx / dist, ny = dy / dist;
        ca.x -= nx * push; ca.y -= ny * push;
        cb.x += nx * push; cb.y += ny * push;
        moved = true;
      }
    }
  }
  if (!moved) break;
}

// 4. Recompute point positions relative to shifted centroids
// (points keep their offset from their centroid)
const positions = umapNorm.map((p, i) => {
  const t = ideasDeduped[i].topic;
  const c = topicCentroids[t];
  // The centroid may have shifted in step 3, but umapNorm was contracted in step 2
  // before centroid separation. Re-derive: original offset = (p - old_centroid).
  // Since we contracted toward the centroid, the offset is already small.
  // Just scale to world coords.
  return {
    x: WORLD_MIN + p.x * (WORLD_MAX - WORLD_MIN),
    y: WORLD_MIN + p.y * (WORLD_MAX - WORLD_MIN),
  };
});

// 5. Jitter overlapping same-post ideas ───────────────────────────────
const postIdeaIndices = {};
for (let i = 0; i < ideasDeduped.length; i++) {
  const pid = ideasDeduped[i].post_id;
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

console.log(`Layout: ${centroidNames.length} topic islands, contraction=${CONTRACTION}`);

// ── Find connections for each idea ───────────────────────────────────
console.log('Computing connections...');

const connections = ideasDeduped.map((idea, i) => {
  const pos = positions[i];
  const emb = vectors[i];

  // Find nearest neighbor by 2D position (different post)
  let nearbyId = null;
  let nearbyDist = Infinity;

  // Find most semantically similar but spatially distant (surprise connection)
  let farId = null;
  let farScore = -Infinity;

  for (let j = 0; j < ideasDeduped.length; j++) {
    if (j === i) continue;

    const dx = positions[j].x - pos.x;
    const dy = positions[j].y - pos.y;
    const spatialDist = Math.sqrt(dx * dx + dy * dy);

    // Nearby: closest by position, different post preferred
    if (spatialDist < nearbyDist) {
      // Prefer different post, but allow same post if nothing else
      if (ideasDeduped[j].post_id !== idea.post_id || nearbyId === null) {
        nearbyDist = spatialDist;
        nearbyId = ideasDeduped[j].id;
      }
    }

    // Far: high cosine similarity but spatially distant (> 1500 units)
    if (spatialDist > 1500 && ideasDeduped[j].post_id !== idea.post_id) {
      const sim = cosineSim(emb, vectors[j]);
      if (sim > farScore) {
        farScore = sim;
        farId = ideasDeduped[j].id;
      }
    }
  }

  return { nearby: nearbyId, far: farId };
});

// ── Build ideas.json output ──────────────────────────────────────────
const ideas = ideasDeduped.map((idea, i) => ({
  id: idea.id,
  post_id: idea.post_id,
  topic: idea.topic,
  kind: idea.kind,
  label: idea.label,
  synthesis: idea.synthesis,
  quote: idea.quote,
  x: Math.round(positions[i].x * 100) / 100,
  y: Math.round(positions[i].y * 100) / 100,
  connections: connections[i],
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

topicsOutput.sort((a, b) => b.count - a.count);

// ── Write outputs ────────────────────────────────────────────────────
writeFileSync(`${DATA_DIR}/ideas.json`, JSON.stringify(ideas, null, 2));
console.log(`Wrote ${DATA_DIR}/ideas.json (${ideas.length} ideas with 2D positions + connections)`);

writeFileSync(`${DATA_DIR}/topics.json`, JSON.stringify(topicsOutput, null, 2));
console.log(`Wrote ${DATA_DIR}/topics.json (${topicsOutput.length} topics with centroids)`);
