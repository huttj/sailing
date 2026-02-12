import { readFileSync, writeFileSync } from 'fs';
import OpenAI from 'openai';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const DATA_DIR = `${ROOT}/public/data`;
const BATCH_CONCURRENCY = 5;

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
  model: 'gpt-4o-mini',
  temperature: 0.3,
  messages: [
    {
      role: 'system',
      content: `You are an expert content analyst. Given a list of blog post titles and subtitles, identify 10–20 broad topic categories that cover the themes across all posts. Return ONLY a JSON array of topic label strings. Example: ["Philosophy", "Technology & Society", "Relationships"]`,
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
  // Strip markdown code fences if present
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

  // Truncate very long posts to ~6000 chars to stay within context
  const truncated = plainText.length > 6000
    ? plainText.slice(0, 6000) + '...'
    : plainText;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: `You are extracting key ideas from a personal blog post. Given the post and a list of topics, extract 2–6 ideas.

For each idea, return:
- "topic": one of the provided topic labels (must match exactly)
- "claim": a bold, assertive claim in 5–15 words. This should read like a provocative opinion or thesis — something a reader would react to with "hmm, do I agree?" NOT a bland description or summary. Write it as a first-person belief or a universal assertion.
  BAD: "Encouraging introspection about engagement and value"
  BAD: "The importance of questioning daily habits"
  GOOD: "We need to ask ourselves why we're doing what we're doing"
  GOOD: "Most of what we call connection is just proximity"
  GOOD: "You can't hold on to someone and let them grow at the same time"
- "quote": a verbatim quote from the text (copy exact words from the post, 10–60 words)

Return ONLY a JSON array. Example:
[{"topic": "Philosophy", "claim": "Meaning isn't found — it's built through repetition", "quote": "Each morning I sit with the question..."}]`,
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
    if (!idea.topic || !idea.claim || !idea.quote) continue;

    // Validate quote exists in post text (case-insensitive)
    const quoteLower = idea.quote.toLowerCase();
    if (plainLower.indexOf(quoteLower) === -1) {
      // Try a shorter version (first 40 chars) as fallback
      const shortQuote = quoteLower.slice(0, 40);
      if (shortQuote.length < 10 || plainLower.indexOf(shortQuote) === -1) {
        continue; // Drop this idea
      }
    }

    // Validate topic is in our list
    if (!topics.includes(idea.topic)) {
      // Try to find closest match
      const match = topics.find(t => t.toLowerCase() === idea.topic.toLowerCase());
      if (match) {
        idea.topic = match;
      } else {
        continue; // Drop ideas with unknown topics
      }
    }

    validated.push({
      id: `${postId}_${i}`,
      post_id: postId,
      topic: idea.topic,
      summary: idea.claim,
      quote: idea.quote,
      text_for_embedding: `${idea.topic}: ${idea.claim}\n${idea.quote}`,
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
console.log(`Topics used: ${[...new Set(allIdeas.map(i => i.topic))].join(', ')}`);
