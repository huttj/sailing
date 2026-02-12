import { readFileSync, writeFileSync } from 'fs';
import OpenAI from 'openai';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const DATA_DIR = `${ROOT}/public/data`;
const BATCH_CONCURRENCY = 20;

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

// ── Pass 2: Per-post Idea Extraction ─────────────────────────────────
console.log(`\n--- Pass 2: Per-post Extraction (${postIds.length} posts, ${BATCH_CONCURRENCY} at a time) ---`);

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

  // Validate each idea
  const validated = [];
  const plainLower = plainText.toLowerCase();

  for (let i = 0; i < ideas.length; i++) {
    const idea = ideas[i];
    if (!idea.topic || !idea.kind || !idea.label || !idea.quote) continue;

    // Validate kind
    if (!['question', 'tension', 'image', 'turn'].includes(idea.kind)) continue;

    // Validate quote exists in post text (case-insensitive)
    const quoteLower = idea.quote.toLowerCase();
    if (plainLower.indexOf(quoteLower) === -1) {
      const shortQuote = quoteLower.slice(0, 40);
      if (shortQuote.length < 10 || plainLower.indexOf(shortQuote) === -1) {
        continue;
      }
    }

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

// Process in batches of BATCH_CONCURRENCY
for (let i = 0; i < postIds.length; i += BATCH_CONCURRENCY) {
  const batch = postIds.slice(i, i + BATCH_CONCURRENCY);
  const batchResults = await Promise.all(batch.map(extractIdeasFromPost));
  for (const ideas of batchResults) {
    allIdeas.push(...ideas);
  }
}

// ── Write output ─────────────────────────────────────────────────────
writeFileSync(`${DATA_DIR}/ideas-raw.json`, JSON.stringify(allIdeas, null, 2));
console.log(`\nWrote ${DATA_DIR}/ideas-raw.json (${allIdeas.length} ideas from ${postIds.length} posts)`);
console.log(`Kinds: ${JSON.stringify(allIdeas.reduce((a, i) => { a[i.kind] = (a[i.kind] || 0) + 1; return a; }, {}))}`);
console.log(`Topics used: ${[...new Set(allIdeas.map(i => i.topic))].join(', ')}`);
