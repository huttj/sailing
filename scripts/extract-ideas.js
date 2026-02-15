import { readFileSync, writeFileSync } from 'fs';
import OpenAI from 'openai';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const DATA_DIR = `${ROOT}/public/data`;

// ── Initialize OpenAI client ─────────────────────────────────────────
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Error: OPENAI_API_KEY environment variable is not set');
  process.exit(1);
}
const openai = new OpenAI({ apiKey });

// ── Load data ────────────────────────────────────────────────────────
const posts = JSON.parse(readFileSync(`${DATA_DIR}/posts.json`, 'utf-8'));
const postIds = Object.keys(posts);
console.log(`Loaded ${postIds.length} posts`);

// ── Pass 1: Topic Discovery ─────────────────────────────────────────
console.log('\n--- Pass 1: Topic Discovery ---');

const titleList = postIds.map((id, i) => {
  const p = posts[id];
  const sub = p.subtitle ? ` — ${p.subtitle}` : '';
  return `${i + 1}. ${p.title}${sub}`;
}).join('\n');

const topicResponse = await openai.chat.completions.create({
  model: 'gpt-5.2',
  temperature: 0.3,
  messages: [
    {
      role: 'system',
      content: `You are an expert content analyst. Given a list of blog post titles and subtitles, identify 8–12 broad topic categories that cover the themes across all posts.

CRITICAL: Each topic must be clearly distinct from every other topic. NO overlapping or synonymous categories. For example, do NOT have both "Self-Reflection" and "Personal Growth" or both "Mental Health" and "Anxiety." Merge related themes into one well-named bucket. Aim for 8–12 categories total — fewer is better than redundant.

Return ONLY a JSON array of topic label strings. Example: ["Philosophy", "Technology & Society", "Relationships"]`,
    },
    {
      role: 'user',
      content: `Here are ${postIds.length} blog post titles:\n\n${titleList}`,
    },
  ],
});

let topics;
try {
  const raw = topicResponse.choices[0].message.content.trim();
  const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  topics = JSON.parse(cleaned);
} catch (e) {
  console.error('Failed to parse topic list:', topicResponse.choices[0].message.content);
  process.exit(1);
}

console.log(`Discovered ${topics.length} topics: ${topics.join(', ')}`);

// ── Helper: extract plain text from HTML ─────────────────────────────
function htmlToPlainText(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Quote snapping — guarantee verbatim quotes ──────────────────────
function normalize(str) {
  return str
    .replace(/[\u2018\u2019\u201C\u201D]/g, c =>
      c === '\u2018' || c === '\u2019' ? "'" : '"')
    .replace(/\u2014/g, '--')
    .replace(/\u2013/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[.,;:!?"'()\[\]{}\-]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function buildNormMap(text) {
  // Map each character in the normalized string back to its index in the original
  const normChars = [];
  const origIndices = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    // Apply same transforms as normalize()
    let mapped = ch;
    if (ch === '\u2018' || ch === '\u2019') mapped = "'";
    else if (ch === '\u201C' || ch === '\u201D') mapped = '"';
    else if (ch === '\u2014') mapped = '--';
    else if (ch === '\u2013') mapped = '-';
    else if (ch === '\u2026') mapped = '...';

    // Strip punctuation
    mapped = mapped.replace(/[.,;:!?"'()\[\]{}\-]/g, '');

    // Collapse whitespace
    if (/\s/.test(ch)) {
      if (normChars.length > 0 && normChars[normChars.length - 1] !== ' ') {
        normChars.push(' ');
        origIndices.push(i);
      }
      continue;
    }

    for (const c of mapped.toLowerCase()) {
      normChars.push(c);
      origIndices.push(i);
    }
  }
  // Trim leading/trailing space
  while (normChars.length > 0 && normChars[0] === ' ') {
    normChars.shift();
    origIndices.shift();
  }
  while (normChars.length > 0 && normChars[normChars.length - 1] === ' ') {
    normChars.pop();
    origIndices.pop();
  }
  return { normStr: normChars.join(''), origIndices };
}

function snapQuoteToSource(llmQuote, plainText) {
  // Strategy 1: Exact case-insensitive match
  const idx = plainText.toLowerCase().indexOf(llmQuote.toLowerCase());
  if (idx !== -1) {
    return plainText.slice(idx, idx + llmQuote.length);
  }

  // Strategy 2: Normalized match with index mapping
  const { normStr: normText, origIndices } = buildNormMap(plainText);
  const normQuote = normalize(llmQuote);
  const normIdx = normText.indexOf(normQuote);
  if (normIdx !== -1) {
    const origStart = origIndices[normIdx];
    const origEnd = origIndices[Math.min(normIdx + normQuote.length - 1, origIndices.length - 1)];
    // Extend origEnd to include the full last character's surroundings
    let end = origEnd + 1;
    // Extend past any trailing punctuation/whitespace that was stripped
    while (end < plainText.length && /[.,;:!?"'()\[\]{}\s\-]/.test(plainText[end])) {
      // Only extend if the next real char would go past our match
      if (end < plainText.length && /\s/.test(plainText[end]) && end > origEnd + 1) break;
      end++;
    }
    return plainText.slice(origStart, end).trim();
  }

  // Strategy 3: Sliding window Jaccard word overlap
  const quoteWords = llmQuote.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  if (quoteWords.length < 3) return null;

  const quoteSet = new Set(quoteWords);
  const textWords = plainText.split(/\s+/);
  const windowSize = quoteWords.length;

  let bestScore = 0;
  let bestStart = -1;
  let bestEnd = -1;

  for (let i = 0; i <= textWords.length - windowSize; i++) {
    const windowWords = textWords.slice(i, i + windowSize);
    const windowSet = new Set(windowWords.map(w => w.toLowerCase()));
    const intersection = [...quoteSet].filter(w => windowSet.has(w)).length;
    const union = new Set([...quoteSet, ...windowSet]).size;
    const jaccard = intersection / union;
    if (jaccard > bestScore) {
      bestScore = jaccard;
      bestStart = i;
      bestEnd = i + windowSize;
    }
  }

  if (bestScore >= 0.4) {
    return textWords.slice(bestStart, bestEnd).join(' ');
  }

  return null;
}

// ── Pass 2: Per-post Idea Extraction ─────────────────────────────────
console.log(`\n--- Pass 2: Per-post Extraction (${postIds.length} posts, all parallel) ---`);

const topicListStr = topics.map((t, i) => `${i + 1}. ${t}`).join('\n');
const allIdeas = [];
let completed = 0;

async function extractIdeasFromPost(postId) {
  const post = posts[postId];
  const plainText = htmlToPlainText(post.html);

  const truncated = plainText.length > 6000
    ? plainText.slice(0, 6000) + '...'
    : plainText;

  const response = await openai.chat.completions.create({
    model: 'gpt-5.2',
    temperature: 0.5,
    messages: [
      {
        role: 'system',
        content: `You are doing archaeological extraction on a personal blog post. You're looking for charged fragments — the live wires running through the writing. Extract 2–6 fragments per post.

Each fragment is one of four kinds:
- "question": A question the writing is wrestling with — not stated explicitly, but the question underneath. Often the author never says it directly, but it's the live wire. Frame it as an actual question.
- "tension": A tension or contradiction being held — two things that don't resolve. Format as "X / Y" or a short phrase capturing the push-pull.
- "image": A vivid image or metaphor the author actually used — the specific language when they were seeing, not explaining. Pick the most charged, poetic, or surprising phrasing.
- "turn": A moment where the thinking shifted mid-entry — a realization, a pivot, an "oh." Frame it as "The moment when..." or similar.

For each fragment, return:
- "topic": one of the provided topic labels (must match exactly)
- "kind": one of "question", "tension", "image", "turn"
- "label": the evocative one-liner that would appear on a map. This is what draws a reader in from a distance.
  For questions: the question itself, e.g. "Who are you performing for when no one's watching?"
  For tensions: the contradiction, e.g. "Wanting solitude / fearing irrelevance"
  For images: the key image, e.g. "Grief is the house you keep returning to"
  For turns: the pivot, e.g. "The moment I realized I was describing my father"
  Keep it under 15 words. Make it magnetic.
- "synthesis": 2–3 sentences written as the author's own reflection — first person, intimate, like you're overhearing them think out loud. NOT a literary analysis or third-person summary. Don't say "the author" or "this piece explores." Instead, channel the author's voice: what they're sitting with, what they can't resolve, what they're noticing.
  IMPORTANT: Use first person ONLY for the blog author's own thoughts and experiences. When the fragment is about someone else the author is describing (e.g. a person they interviewed, observed, or are profiling), use that person's name and third person. If the author writes about "Omar's split-brain experiment," the synthesis should say "Omar is running..." not "I'm running..."
  CRITICAL: Include enough concrete context that a reader who hasn't read the post understands what's being described. Name the SPECIFIC thing — don't hide behind vague abstractions like "compulsive workaround" or "transformative process." If the author is talking about how they try to control outcomes because good things ending terrifies them, SAY that. Ground every synthesis in the actual content.
- "quote": a verbatim quote from the text (copy exact words, 10–80 words). Pick the most alive passage — where the author was cooking.

Return ONLY a JSON array. Example:
[{"topic": "Identity", "kind": "question", "label": "Who are you performing for when no one's watching?", "synthesis": "There's this gap between who I am alone and who I become around other people. I keep circling it without landing — like naming it would collapse the superposition.", "quote": "I wonder sometimes if the version of me that exists in their minds is more real than the one I experience..."}]`,
      },
      {
        role: 'user',
        content: `Topics:\n${topicListStr}\n\nPost title: "${post.title}"\n\nPost text:\n${truncated}`,
      },
    ],
  });

  let ideas;
  try {
    const raw = response.choices[0].message.content.trim();
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
    ideas = JSON.parse(cleaned);
  } catch (e) {
    console.warn(`  Warning: Failed to parse ideas for ${postId}, skipping`);
    return [];
  }

  // Validate & snap quotes to source text
  const validated = [];

  for (let i = 0; i < ideas.length; i++) {
    const idea = ideas[i];
    if (!idea.topic || !idea.kind || !idea.label || !idea.quote) continue;

    // Validate kind
    if (!['question', 'tension', 'image', 'turn'].includes(idea.kind)) continue;

    // Snap quote to verbatim source text
    const snapped = snapQuoteToSource(idea.quote, plainText);
    if (!snapped) {
      console.warn(`  Warning: Could not snap quote for ${postId}_${i}: "${idea.quote.slice(0, 50)}..."`);
      continue;
    }
    idea.quote = snapped;

    // Validate topic is in our list
    if (!topics.includes(idea.topic)) {
      const match = topics.find(t => t.toLowerCase() === idea.topic.toLowerCase());
      if (match) {
        idea.topic = match;
      } else {
        continue;
      }
    }

    validated.push({
      id: `${postId}_${i}`,
      post_id: postId,
      topic: idea.topic,
      kind: idea.kind,
      label: idea.label,
      synthesis: idea.synthesis || '',
      quote: idea.quote,
      text_for_embedding: `${idea.label}\n${idea.synthesis}\n${idea.quote}`,
    });
  }

  completed++;
  if (completed % 10 === 0 || completed === postIds.length) {
    console.log(`  ${completed}/${postIds.length} posts processed`);
  }

  return validated;
}

// Fire all posts in parallel — OpenAI SDK handles rate limit retries
const allResults = await Promise.all(postIds.map(extractIdeasFromPost));
for (const ideas of allResults) {
  allIdeas.push(...ideas);
}

// ── Write output ─────────────────────────────────────────────────────
writeFileSync(`${DATA_DIR}/ideas-raw.json`, JSON.stringify(allIdeas, null, 2));
console.log(`\nWrote ${DATA_DIR}/ideas-raw.json (${allIdeas.length} ideas from ${postIds.length} posts)`);
console.log(`Kinds: ${JSON.stringify(allIdeas.reduce((a, i) => { a[i.kind] = (a[i.kind] || 0) + 1; return a; }, {}))}`);
console.log(`Topics used: ${[...new Set(allIdeas.map(i => i.topic))].join(', ')}`);
