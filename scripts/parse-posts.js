import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { parse } from 'csv-parse/sync';
import * as cheerio from 'cheerio';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const POSTS_DIR = `${ROOT}/posts`;
const OUT_DIR = `${ROOT}/public/data`;

const MAX_CHUNK_CHARS = 1600;
const MIN_CHUNK_CHARS = 50;
const FALLBACK_PARA_GROUP = 3; // for posts with no structural boundaries

// ── Read and filter CSV ──────────────────────────────────────────────
const csv = readFileSync(`${ROOT}/posts.csv`, 'utf-8');
const rows = parse(csv, { columns: true, skip_empty_lines: true });
const published = rows.filter(r => r.is_published === 'true');

console.log(`Found ${published.length} published posts out of ${rows.length} total`);

// ── Build a lookup of available HTML files by numeric ID ─────────────
const htmlFiles = readdirSync(POSTS_DIR).filter(f => f.endsWith('.html'));
const htmlByNumericId = {};
for (const f of htmlFiles) {
  const numId = f.split('.')[0];
  htmlByNumericId[numId] = f;
}

// ── Boundary tag names (lowercase) ──────────────────────────────────
const BOUNDARY_TAGS = new Set(['h2', 'h3', 'hr']);
const CONTENT_TAGS = new Set(['p', 'blockquote', 'ul', 'ol', 'div']);

// ── Helpers ──────────────────────────────────────────────────────────
function textLen(html) {
  const $ = cheerio.load(html, null, false);
  return $.text().trim().length;
}

function plainText(html) {
  const $ = cheerio.load(html, null, false);
  return $.text().trim();
}

function outerHtml($el) {
  // cheerio outer html
  return cheerio.load('<root/>').html($el);
}

// ── Chunk one post ───────────────────────────────────────────────────
function chunkPost(fullHtml, postId) {
  const $ = cheerio.load(fullHtml, null, false);
  const topLevel = $.root().children().toArray();

  // Detect whether the post has any structural boundaries
  const hasBoundaries = topLevel.some(el => BOUNDARY_TAGS.has(el.tagName));

  // Accumulate raw segments: { html, text, heading, isBoundary }
  let rawChunks = [];
  let currentHtmlParts = [];
  let currentHeading = null;

  function flushCurrent() {
    if (currentHtmlParts.length === 0) return;
    const html = currentHtmlParts.join('');
    const text = plainText(html);
    rawChunks.push({ html, text, heading: currentHeading });
    currentHtmlParts = [];
    currentHeading = null;
  }

  if (hasBoundaries) {
    for (const el of topLevel) {
      const tag = el.tagName;
      const elHtml = $.html(el);

      if (BOUNDARY_TAGS.has(tag)) {
        // Flush whatever we have accumulated
        flushCurrent();
        if (tag === 'h2' || tag === 'h3') {
          currentHeading = $(el).text().trim();
          // The heading HTML itself starts the new chunk
          currentHtmlParts.push(elHtml);
        } else {
          // <hr> — starts a new chunk but no heading
          currentHtmlParts.push(elHtml);
        }
      } else if (CONTENT_TAGS.has(tag)) {
        currentHtmlParts.push(elHtml);
      } else {
        // Other tags (e.g. <figure>, <section>) — treat as content
        currentHtmlParts.push(elHtml);
      }
    }
    flushCurrent();
  } else {
    // No structural boundaries — group every FALLBACK_PARA_GROUP paragraphs
    let group = [];
    let count = 0;
    for (const el of topLevel) {
      const elHtml = $.html(el);
      group.push(elHtml);
      if (el.tagName === 'p') count++;
      if (count >= FALLBACK_PARA_GROUP) {
        const html = group.join('');
        rawChunks.push({ html, text: plainText(html), heading: null });
        group = [];
        count = 0;
      }
    }
    if (group.length > 0) {
      const html = group.join('');
      rawChunks.push({ html, text: plainText(html), heading: null });
    }
  }

  // ── Enforce max chunk size by splitting large chunks ──────────────
  let sized = [];
  for (const chunk of rawChunks) {
    if (chunk.text.length <= MAX_CHUNK_CHARS) {
      sized.push(chunk);
      continue;
    }
    // Re-parse chunk HTML and split by paragraphs / top-level elements
    const $c = cheerio.load(chunk.html, null, false);
    const children = $c.root().children().toArray();
    let parts = [];
    let partHeading = chunk.heading;
    for (const child of children) {
      const childHtml = $c.html(child);
      const childText = plainText(childHtml);
      // Check if adding this child would exceed the cap
      const currentText = parts.map(p => plainText(p)).join(' ');
      if (currentText.length + childText.length > MAX_CHUNK_CHARS && parts.length > 0) {
        sized.push({ html: parts.join(''), text: plainText(parts.join('')), heading: partHeading });
        parts = [childHtml];
        partHeading = null; // heading only on first sub-chunk
      } else {
        parts.push(childHtml);
      }
    }
    if (parts.length > 0) {
      sized.push({ html: parts.join(''), text: plainText(parts.join('')), heading: partHeading });
    }
  }

  // ── Merge tiny chunks with previous neighbor ──────────────────────
  let merged = [];
  for (const chunk of sized) {
    if (chunk.text.length < MIN_CHUNK_CHARS && merged.length > 0) {
      const prev = merged[merged.length - 1];
      prev.html += chunk.html;
      prev.text = plainText(prev.html);
      // Keep previous heading if it had one
    } else {
      merged.push(chunk);
    }
  }

  // ── Compute character offsets within fullHtml ─────────────────────
  // We track where each chunk's HTML appears in the full concatenated HTML
  const chunks = [];
  let searchFrom = 0;
  for (let i = 0; i < merged.length; i++) {
    const c = merged[i];
    // Find the start of this chunk's first element in fullHtml
    // We use the first significant tag from the chunk
    const $first = cheerio.load(c.html, null, false);
    const firstChild = $first.root().children().first();
    let firstTag = '';
    if (firstChild.length) {
      // Get the opening portion to search for
      const fullFirstEl = $first.html(firstChild);
      firstTag = fullFirstEl.substring(0, Math.min(80, fullFirstEl.length));
    }

    let start = -1;
    if (firstTag) {
      start = fullHtml.indexOf(firstTag, searchFrom);
    }
    if (start === -1) {
      // Fallback: use the raw html substring
      start = fullHtml.indexOf(c.html.substring(0, 80), searchFrom);
    }
    if (start === -1) start = searchFrom;

    // Find the end by locating the last element of the chunk
    const $last = cheerio.load(c.html, null, false);
    const lastChild = $last.root().children().last();
    let lastElHtml = '';
    if (lastChild.length) {
      lastElHtml = $last.html(lastChild);
    }
    let end = start + c.html.length;
    if (lastElHtml) {
      const lastPos = fullHtml.indexOf(lastElHtml, start);
      if (lastPos !== -1) {
        end = lastPos + lastElHtml.length;
      }
    }

    searchFrom = end;

    const preview = c.text.substring(0, 120);
    chunks.push({
      id: `${postId}_${i}`,
      post_id: postId,
      text_content: c.text,
      html_content: c.html,
      preview,
      heading: c.heading || null,
      start,
      end,
    });
  }

  return chunks;
}

// ── Main processing loop ─────────────────────────────────────────────
const allChunks = [];
const postsData = {};
let matched = 0;
let skipped = 0;

for (const row of published) {
  const postId = row.post_id;
  const numericId = postId.split('.')[0];
  const htmlFile = htmlByNumericId[numericId];

  if (!htmlFile) {
    skipped++;
    continue;
  }

  matched++;
  const fullHtml = readFileSync(`${POSTS_DIR}/${htmlFile}`, 'utf-8');
  const chunks = chunkPost(fullHtml, postId);

  allChunks.push(...chunks);

  postsData[postId] = {
    title: row.title,
    subtitle: row.subtitle || '',
    date: row.post_date,
    html: fullHtml,
    chunks: chunks.map(c => ({ id: c.id, start: c.start, end: c.end })),
  };
}

console.log(`Matched ${matched} posts to HTML files, skipped ${skipped}`);
console.log(`Generated ${allChunks.length} chunks total`);

// ── Write outputs ────────────────────────────────────────────────────
writeFileSync(`${OUT_DIR}/chunks-raw.json`, JSON.stringify(allChunks, null, 2));
writeFileSync(`${OUT_DIR}/posts.json`, JSON.stringify(postsData, null, 2));

console.log(`Wrote ${OUT_DIR}/chunks-raw.json`);
console.log(`Wrote ${OUT_DIR}/posts.json`);
