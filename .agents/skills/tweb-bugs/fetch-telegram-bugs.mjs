#!/usr/bin/env node

/**
 * Scraper for bugs.telegram.org (WebK issues, tag_ids=40).
 *
 * Usage:
 *   node fetch-telegram-bugs.mjs [--cache-dir DIR] [--detailed] [--status STATUS]
 *
 * --cache-dir   Where to write output (default: CWD/.claude/bugs-cache/telegram)
 * --detailed    Fetch each individual issue page for full body, votes, device info
 * --status      Filter by status: open | fixed | closed | fix_coming | all (default: all)
 *
 * Output: issues-raw.json  — array of unified-format bug objects
 *         last-fetch.txt   — ISO timestamp
 */

const TAG_ID = 40; // WebK
const BASE = 'https://bugs.telegram.org';
const PAGE_SIZE = 50; // server returns 50 per batch
const CONCURRENT_DETAIL = 5; // parallel detail fetches
const DELAY_MS = 300; // polite delay between batches

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {cacheDir: null, detailed: false, status: 'all'};
  for(let i = 0; i < args.length; i++) {
    if(args[i] === '--cache-dir' && args[i + 1]) opts.cacheDir = args[++i];
    else if(args[i] === '--detailed') opts.detailed = true;
    else if(args[i] === '--status' && args[i + 1]) opts.status = args[++i];
  }
  return opts;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/** Parse an HTML card element string into a bug object */
function parseCard(cardHtml) {
  const id = cardHtml.match(/data-card-id="(\d+)"/)?.[1];
  if(!id) return null;

  const statusMatch = cardHtml.match(/bt-card-thumb-status[^>]*>([^<]+)</);
  const status = normalizeStatus(statusMatch?.[1]?.trim() || 'Open');

  const titleMatch = cardHtml.match(/bt-card-title[^>]*>\s*([\s\S]*?)\s*<\/div>/);
  const title = decodeHtmlEntities(titleMatch?.[1]?.trim() || '');

  const previewMatch = cardHtml.match(/bt-card-preview[^>]*>([\s\S]*?)<\/div>/);
  const preview = decodeHtmlEntities(previewMatch?.[1]?.trim() || '');

  const dateMatch = cardHtml.match(/datetime="([^"]+)"/);
  const created_at = dateMatch?.[1] || '';

  const repliesMatch = cardHtml.match(/cd-issue-replies[^>]*>.*?<span class="value"[^>]*>(\d+)<\/span>/s);
  const comments_count = parseInt(repliesMatch?.[1] || '0', 10);

  const likesMatch = cardHtml.match(/cd-issue-like[^>]*>.*?<span class="value"[^>]*>(\d+)<\/span>/s);
  const votes_up = parseInt(likesMatch?.[1] || '0', 10);

  return {
    id: `telegram-${id}`,
    platform: 'telegram',
    number: parseInt(id, 10),
    title,
    body: preview,
    status,
    url: `${BASE}/c/${id}`,
    created_at,
    updated_at: created_at, // list page doesn't have updated_at
    votes: {up: votes_up, down: 0, total: votes_up},
    comments_count,
    tags: ['WebK'],
    labels: [],
    author: '',
    device_info: '',
    steps_to_reproduce: ''
  };
}

function normalizeStatus(raw) {
  const s = raw.toLowerCase().trim();
  if(s === 'fixed') return 'fixed';
  if(s === 'open') return 'open';
  if(s === 'closed') return 'closed';
  if(s === 'fix coming') return 'fix_coming';
  return s;
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/** Extract all cards from an HTML blob */
function extractCards(html) {
  const cards = [];
  const re = /<a\s+href="\/c\/\d+"[^>]*class="bt-card-row"[\s\S]*?<\/a>/g;
  let m;
  while((m = re.exec(html)) !== null) {
    const card = parseCard(m[0]);
    if(card) cards.push(card);
  }
  return cards;
}

/** Fetch full details from an individual issue page */
async function fetchIssueDetail(issueId, cookieStr) {
  const resp = await fetch(`${BASE}/c/${issueId}`, {
    headers: {Cookie: cookieStr}
  });
  if(!resp.ok) return null;
  const html = await resp.text();

  // Body text (full description with steps & device info)
  const bodyMatch = html.match(/bt-issue-text bt-markdown[^>]*>([\s\S]*?)<\/div>\s*<div class="bt-issue-files/);
  const bodyHtml = bodyMatch?.[1] || '';
  const body = stripHtml(bodyHtml).trim();

  // Votes
  const likeMatch = html.match(/cd-issue-like[^>]*>.*?data-value="(\d+)"/s);
  const dislikeMatch = html.match(/cd-issue-dislike[^>]*>.*?data-value="(\d+)"/s);
  const up = parseInt(likeMatch?.[1] || '0', 10);
  const down = parseInt(dislikeMatch?.[1] || '0', 10);

  // Comments count
  const commentsMatch = html.match(/bt-header-cnt[^>]*>(\d+)<\/span>/);
  const comments_count = parseInt(commentsMatch?.[1] || '0', 10);

  // Device info (extract from body)
  const deviceMatch = body.match(/Device info\s*([\s\S]*?)$/i);
  const device_info = deviceMatch?.[1]?.trim() || '';

  // Steps to reproduce
  const stepsMatch = body.match(/Steps to reproduce\s*([\s\S]*?)(?:Device info|$)/i);
  const steps = stepsMatch?.[1]?.trim() || '';

  // Author (in <span class="bt-issue-author"><span dir="auto">username...</span>)
  const authorMatch = html.match(/bt-issue-author[^>]*>\s*<span[^>]*dir="auto"[^>]*>([^<]+)/s);
  const author = authorMatch?.[1]?.trim() || '';

  return {body, votes: {up, down, total: up + down}, comments_count, device_info, steps_to_reproduce: steps, author};
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<h[1-6][^>]*>/gi, '\n## ')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();
  const fs = await import('fs');
  const path = await import('path');

  const cacheDir = opts.cacheDir || path.join(process.cwd(), '.claude', 'bugs-cache', 'telegram');
  fs.mkdirSync(cacheDir, {recursive: true});

  console.error('[telegram-bugs] Fetching initial page...');

  // Step 1: Get hash + cookies from initial page load
  const initResp = await fetch(`${BASE}/?tag_ids=${TAG_ID}&sort=time&type=issues`);
  const initHtml = await initResp.text();
  const hashMatch = initHtml.match(/apiUrl.*?hash=([a-f0-9]+)/);
  if(!hashMatch) {
    console.error('[telegram-bugs] ERROR: Could not extract API hash from page');
    process.exit(1);
  }
  const apiHash = hashMatch[1];
  const rawCookies = initResp.headers.getSetCookie?.() || [];
  const cookieStr = rawCookies.map(c => c.split(';')[0]).join('; ') +
    '; stel_dt=' + encodeURIComponent(new Date().getTimezoneOffset());

  const apiUrl = `${BASE}/api?hash=${apiHash}`;

  // Step 2: Parse cards from initial HTML
  let allCards = extractCards(initHtml);
  console.error(`[telegram-bugs] Initial page: ${allCards.length} cards`);

  // Step 3: Find initial offset and paginate
  let offsetMatch = initHtml.match(/data-offset="([^"]+)"/);
  let offset = offsetMatch?.[1] || null;

  while(offset) {
    await sleep(DELAY_MS);
    console.error(`[telegram-bugs] Fetching offset=${offset}...`);

    const params = new URLSearchParams();
    params.append('method', 'searchIssues');
    params.append('tag_ids', String(TAG_ID));
    params.append('sort', 'time');
    params.append('type', 'issues');
    params.append('offset', offset);

    const resp = await fetch(apiUrl, {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieStr,
        'Origin': BASE,
        'Referer': `${BASE}/?tag_ids=${TAG_ID}&sort=time&type=issues`,
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    if(!resp.ok) {
      console.error(`[telegram-bugs] API error: ${resp.status}`);
      break;
    }

    const data = await resp.json();
    if(data.error) {
      console.error(`[telegram-bugs] API error: ${data.error}`);
      break;
    }

    if(!data.rows_html) {
      break;
    }

    const pageCards = extractCards(data.rows_html);
    if(pageCards.length === 0) break;

    allCards = allCards.concat(pageCards);
    console.error(`[telegram-bugs] Total so far: ${allCards.length}`);

    // Next offset
    const nextOffset = data.rows_html.match(/data-offset="([^"]+)"/);
    offset = nextOffset?.[1] || null;
  }

  console.error(`[telegram-bugs] Fetched ${allCards.length} total cards from list`);

  // Step 4: Filter by status if requested
  if(opts.status !== 'all') {
    allCards = allCards.filter(c => c.status === opts.status);
    console.error(`[telegram-bugs] After status filter (${opts.status}): ${allCards.length}`);
  }

  // Step 5: Optionally fetch detailed info for each card
  if(opts.detailed) {
    console.error(`[telegram-bugs] Fetching details for ${allCards.length} issues...`);
    const chunks = [];
    for(let i = 0; i < allCards.length; i += CONCURRENT_DETAIL) {
      chunks.push(allCards.slice(i, i + CONCURRENT_DETAIL));
    }

    for(const [ci, chunk] of chunks.entries()) {
      const results = await Promise.all(
        chunk.map(card => fetchIssueDetail(card.number, cookieStr).catch(() => null))
      );
      for(let j = 0; j < chunk.length; j++) {
        const detail = results[j];
        if(detail) {
          chunk[j].body = detail.body || chunk[j].body;
          chunk[j].votes = detail.votes;
          chunk[j].comments_count = detail.comments_count || chunk[j].comments_count;
          chunk[j].device_info = detail.device_info;
          chunk[j].steps_to_reproduce = detail.steps_to_reproduce;
          chunk[j].author = detail.author || chunk[j].author;
        }
      }
      console.error(`[telegram-bugs] Details: ${Math.min((ci + 1) * CONCURRENT_DETAIL, allCards.length)}/${allCards.length}`);
      if(ci < chunks.length - 1) await sleep(DELAY_MS);
    }
  }

  // Step 6: Deduplicate by ID
  const seen = new Set();
  const unique = [];
  for(const card of allCards) {
    if(!seen.has(card.id)) {
      seen.add(card.id);
      unique.push(card);
    }
  }

  // Step 7: Save
  const outPath = path.join(cacheDir, 'issues-raw.json');
  fs.writeFileSync(outPath, JSON.stringify(unique, null, 2));
  fs.writeFileSync(path.join(cacheDir, 'last-fetch.txt'), new Date().toISOString());

  console.error(`[telegram-bugs] Saved ${unique.length} issues to ${outPath}`);
  console.log(JSON.stringify({count: unique.length, path: outPath}));
}

main().catch(e => {
  console.error('[telegram-bugs] Fatal:', e);
  process.exit(1);
});
