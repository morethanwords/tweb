---
name: tweb-bugs
description: "Parse, deduplicate, and prioritize bugs from GitHub (morethanwords/tweb) and bugs.telegram.org (WebK). Use when the user asks to analyze tweb bugs, triage issues, or review the tweb bug backlog."
user-invocable: true
argument-hint: "[--refresh] [--top N] [--label LABEL] [--platform github|telegram|all] [--status open|fixed|all] [--detailed] [--semantic-dupes]"
allowed-tools: ["Read", "Write", "Bash(*)", "Glob", "Grep", "WebFetch", "Agent"]
---

# /tweb-bugs — Triage & Prioritize tweb Bugs (GitHub + bugs.telegram.org)

Fetch open bugs from **both** platforms, normalize to a unified format, deduplicate, score, and produce a prioritized bug report.

## Platforms

| Platform | Source | Tag/Filter |
|----------|--------|-----------|
| **GitHub** | `morethanwords/tweb` open issues | Exclude PRs, `enhancement`, `feature` labels |
| **Telegram** | `bugs.telegram.org/?tag_ids=40` | WebK tag (id=40) |

## Arguments

- `--refresh` — force re-fetch from all platforms (ignore cache)
- `--top N` — show only top N bugs (default: show all)
- `--label LABEL` — filter by GitHub label
- `--platform github|telegram|all` — which platform to fetch/report (default: `all`)
- `--status open|fixed|all` — filter by status (default: `open` for GitHub, `all` for Telegram)
- `--detailed` — for Telegram bugs, fetch each individual page for full description, votes, device info (slower but more accurate scoring)
- `--no-graph` — skip graphify graph lookup in Step 3.5 (useful if graph is outdated or not built)
- `--semantic-dupes` — run LLM-powered root-cause duplicate analysis on ALL bugs (see Step 6 below). Uses cached categorizations if available (<7 days), otherwise dispatches 5 parallel Sonnet agents. Produces `graphify-semantic-duplicates-report.md`
- No arguments — use cache if fresh (< 24h), otherwise re-fetch. Graph lookup is enabled by default if `graphify-out/graph.json` exists

## Cache Location

`C:\Users\user\tweb\.claude\bugs-cache\`

Stored **per-platform** in separate subdirectories:

```
bugs-cache/
├── github/
│   ├── issues-raw.json      — raw GitHub API response (unified format)
│   ├── last-fetch.txt        — ISO timestamp of last fetch
│   └── issues-scored.json    — analyzed, scored issues
├── telegram/
│   ├── issues-raw.json      — scraped issues (unified format)
│   ├── last-fetch.txt        — ISO timestamp of last fetch
│   └── issues-scored.json    — analyzed, scored issues
├── report.md                 — combined prioritized report
└── graph-lookup.json         — cached graph community mappings per bug (from Step 3.5)
```

## Unified Bug Format

Both platforms produce the same JSON shape in their `issues-raw.json`:

```json
{
  "id": "github-123",
  "platform": "github",
  "number": 123,
  "title": "Bug title",
  "body": "Full description text",
  "status": "open",
  "url": "https://github.com/morethanwords/tweb/issues/123",
  "created_at": "2026-03-01T12:00:00Z",
  "updated_at": "2026-03-05T15:30:00Z",
  "votes": {"up": 5, "down": 0, "total": 5},
  "comments_count": 3,
  "tags": ["WebK"],
  "labels": ["bug"],
  "author": "username",
  "device_info": "Chrome 146, Windows",
  "steps_to_reproduce": "1. Open chat\n2. Click send"
}
```

### Field mapping

| Unified field | GitHub source | Telegram source |
|--------------|--------------|-----------------|
| `id` | `"github-{number}"` | `"telegram-{card_id}"` |
| `platform` | `"github"` | `"telegram"` |
| `number` | issue number | card ID from `data-card-id` |
| `title` | `title` | `.bt-card-title` |
| `body` | `body` | `.bt-card-preview` (list) or `.bt-issue-text` (detailed) |
| `status` | `state` (open/closed) | `.bt-card-thumb-status` → normalized |
| `url` | `html_url` | `https://bugs.telegram.org/c/{id}` |
| `created_at` | `created_at` | `time[datetime]` |
| `updated_at` | `updated_at` | same as `created_at` (not available in list) |
| `votes.up` | `reactions.+1` + `reactions.heart` | like `data-value` (detailed only) |
| `votes.down` | `reactions.-1` | dislike `data-value` (detailed only) |
| `votes.total` | `reactions.total_count` | up + down |
| `comments_count` | `comments` | `.cd-issue-replies .value` or `.bt-header-cnt` |
| `tags` | — | `["WebK"]` |
| `labels` | `labels[].name` | — |
| `author` | `user.login` | `.bt-issue-author` (detailed only) |
| `device_info` | parsed from body | parsed from body |
| `steps_to_reproduce` | parsed from body | parsed from body |

## Workflow

### Step 1: Check Cache

For each requested platform:
1. Read `{platform}/last-fetch.txt`. If it exists and is < 24h old AND `--refresh` was NOT passed, skip fetching that platform.
2. Otherwise proceed to fetch.

### Step 2: Fetch Issues

#### GitHub

```bash
rtk gh api --paginate "repos/morethanwords/tweb/issues?state=open&per_page=100" > github/issues-raw-api.json
```

Then normalize each issue to unified format:

```javascript
// Pseudocode for GitHub normalization
for each issue in raw_response:
  if issue.pull_request: skip  // PRs appear in issues API
  if issue.labels includes "enhancement" or "feature": skip

  unified = {
    id: "github-" + issue.number,
    platform: "github",
    number: issue.number,
    title: issue.title,
    body: issue.body,
    status: issue.state,  // "open" or "closed"
    url: issue.html_url,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    votes: {
      up: (issue.reactions["+1"] || 0) + (issue.reactions.heart || 0),
      down: issue.reactions["-1"] || 0,
      total: issue.reactions.total_count || 0
    },
    comments_count: issue.comments,
    tags: [],
    labels: issue.labels.map(l => l.name),
    author: issue.user.login,
    device_info: extractDeviceInfo(issue.body),
    steps_to_reproduce: extractSteps(issue.body)
  }
```

Save normalized array to `github/issues-raw.json`. Update `github/last-fetch.txt`.

#### Telegram (bugs.telegram.org)

Use the scraper script:

```bash
node "$SKILL_DIR/fetch-telegram-bugs.mjs" --cache-dir "$CACHE_DIR/telegram" [--detailed] [--status STATUS]
```

The script (`fetch-telegram-bugs.mjs` in the skill directory):
1. Fetches `https://bugs.telegram.org/?tag_ids=40&sort=time&type=issues` to get session hash + cookies
2. Parses all cards from initial HTML (50 items)
3. Paginates via POST to `/api?hash=...` with `method=searchIssues`, `offset=N`
4. Extracts: id, title, status, date, preview, reply count from card HTML
5. With `--detailed`: fetches each `/c/{id}` page for full body, votes, device info, author
6. Saves unified-format array to `telegram/issues-raw.json`

The `SKILL_DIR` is `C:\Users\user\.claude\skills\tweb-bugs`.

### Step 3: Analyze & Score

Load issues from all requested platforms' `issues-raw.json` files. Merge into one array.

For each issue, compute these scores (1-10 scale):

#### Scoring Criteria

| Criterion | Weight | How to Score |
|-----------|--------|-------------|
| **Severity** | 3x | Data loss/crash=10, broken core feature=8, cosmetic=2 |
| **Reproduction Probability** | 2x | Always reproducible=10, intermittent=5, cannot reproduce=1 |
| **User Impact Breadth** | 2x | Affects all users=10, specific platform=5, niche browser=2 |
| **Community Signal** | 1.5x | Reactions + comments normalized. Many reactions = high demand |
| **Age Penalty** | 1x | Older bugs get slight boost (long-standing = annoying) |
| **Regression Risk** | 1.5x | "Was working before" / "regression" keywords = higher priority |
| **Data Loss Risk** | 2x | Messages lost, media corrupted, settings wiped = critical |
| **Clear Repro Steps** | 1x | Issue has steps to reproduce = easier to fix = slight boost |

#### Browser/Platform Modifiers
- Chrome/Firefox/Safari/Edge (mainstream) = no modifier
- Opera/Vivaldi/Brave = -1 to breadth
- IE/obscure mobile browsers = -3 to breadth
- Mobile-only = slight reduction unless large mobile userbase
- Electron/desktop app specific = neutral

#### Deduplication

- Group issues by similarity (same root cause, same feature area) — **cross-platform too!**
- A bug reported on both GitHub and bugs.telegram.org likely has the same root cause
- Mark duplicates, keep the one with most detail/reactions as primary
- Link duplicates in the report, noting which platforms they appear on

#### Final Score Formula
```
final = (severity * 3 + repro_prob * 2 + breadth * 2 + community * 1.5 + age * 1 + regression * 1.5 + data_loss * 2 + clear_repro * 1) / 14
```

Normalize to 1-10 scale.

### Step 3.5: Graph-Based Root Cause Lookup (graphify integration)

**Prerequisite:** `graphify-out/graph.json` and `graphify-out/wiki/index.md` must exist in the tweb project root. If they don't, skip this step and note "Graph not available — run /graphify to enable root cause analysis" in the report.

For each scored issue, perform a graph lookup to identify the code community (cluster of related source files/functions) most likely responsible for the bug. This step transforms textual similarity deduplication into **structural code-graph deduplication**.

#### Why this matters

Bugs with identical titles (e.g. two bugs both titled "Download") may map to completely different code communities:
- "Download completes but file not saved" → **Download Manager** community (appDownloadManager.ts, SW iframe path)
- "Download keeps restarting" → **File Download Engine** community (apiFileManager.ts, MTProto chunk loop)

Text-based dedup would merge them. Graph-based dedup correctly separates them.

#### How to perform the lookup

```bash
python -c "
import json, sys
from pathlib import Path
from networkx.readwrite import json_graph

graph_path = Path('graphify-out/graph.json')
if not graph_path.exists():
    print('SKIP: no graph')
    sys.exit(0)

data = json.loads(graph_path.read_text(encoding='utf-8'))
G = json_graph.node_link_graph(data, edges='links')

# Load community labels
labels_path = Path('.graphify_labels.json')
if labels_path.exists():
    labels = {int(k): v for k, v in json.loads(labels_path.read_text(encoding='utf-8')).items()}
else:
    labels = {}

def lookup_bug(keywords):
    '''Find matching graph nodes and their communities for a list of keywords.'''
    terms = [t.lower() for t in keywords if len(t) > 2]
    scored = []
    for nid, ndata in G.nodes(data=True):
        label = ndata.get('label', '').lower()
        source = ndata.get('source_file', '').lower()
        score = sum(2 for t in terms if t in label) + sum(1 for t in terms if t in source)
        if score > 0:
            scored.append((score, nid, ndata))
    scored.sort(reverse=True)
    top = scored[:10]

    # Group by community
    communities = {}
    for score, nid, ndata in top:
        cid = ndata.get('community', -1)
        if cid not in communities:
            communities[cid] = {
                'community_id': cid,
                'community_name': labels.get(cid, f'Community {cid}'),
                'nodes': [],
                'source_files': set()
            }
        communities[cid]['nodes'].append(ndata.get('label', nid))
        if ndata.get('source_file'):
            communities[cid]['source_files'].add(ndata['source_file'])

    # Return top 3 communities by match score
    result = []
    for cid, info in list(communities.items())[:3]:
        info['source_files'] = list(info['source_files'])
        result.append(info)
    return result

# Example: lookup_bug(['download', 'save', 'file', 'progress'])
# Returns: [{'community_id': 106, 'community_name': 'Download Manager', 'nodes': [...], 'source_files': [...]}]
"
```

For each bug, extract 3-8 keywords from the title + body (feature area, action, error type) and call `lookup_bug(keywords)`. Add the result to the scored issue:

```json
{
  "graph_root": {
    "primary_community": {
      "id": 106,
      "name": "Download Manager",
      "key_files": ["src/lib/appDownloadManager.ts"]
    },
    "related_communities": [
      {"id": 496, "name": "Save-to-Disk Anchor"},
      {"id": 17, "name": "API Manager Proxy & SW"}
    ]
  }
}
```

#### Graph-enhanced deduplication rules

After the standard text-based deduplication, apply these additional rules:

1. **Same community = candidate duplicate** — even if titles differ, bugs mapping to the same primary community are likely related. Flag them as a duplicate group.
2. **Different community = NOT duplicate** — even if titles are identical, bugs mapping to different primary communities should NOT be merged. Note the community difference explicitly.
3. **Adjacent communities = related** — if two bugs map to communities that share edges in the graph, note them as "related but distinct root cause."

#### Reading wiki articles for context

If `graphify-out/wiki/` exists, read the wiki article for the matched community to get richer context:

```bash
# For a bug matching community "Download Manager":
cat graphify-out/wiki/Download_Manager.md
```

This provides the list of key functions, their connections, source files, and audit trail — useful for writing the "root cause" description in the report.



Create `report.md` with:

```markdown
# tweb Bug Triage Report
Generated: {date} | GitHub: {N} issues | Telegram: {M} issues | Duplicates removed: {D}

## Critical (score >= 8)
| # | Score | Platform | Title | Key Tags | Age |
...

## High (score 6-7.9)
...

## Medium (score 4-5.9)
...

## Low (score < 4)
...

## Cross-Platform Duplicates
- GitHub #X ↔ Telegram #Y — same root cause: {description}
...

## Duplicate Groups
- Issues #X, #Y, #Z — same root cause: {description}
...

## By Code Area (graphify communities)
### {community_name} (community {id})
- [#{bug_number}] Score {score} — {title}
- [#{bug_number}] Score {score} — {title}
  → Key files: {source_files}
  → Wiki: graphify-out/wiki/{community_name}.md
...
```

### Step 5: Output

- Save `issues-scored.json` to each platform's cache dir and `report.md` to the cache root
- Display the report to the user (or top N if `--top` was passed)
- Mention how many were fetched per platform, how many dupes found, cache status

### Step 6: Semantic Duplicate Analysis (`--semantic-dupes`)

This step uses LLM root-cause analysis to find duplicate bugs that text matching cannot detect. Two bugs phrased completely differently ("video not playing" vs "media fails to load in channels") get the same standardized root_problem string, exposing them as duplicates.

**Why this is needed:** Text matching (TF-IDF, fuzzy) groups bugs by shared words, not shared problems. It merges unrelated bugs ("video not playing" + "no audio in video") and misses true duplicates with different wording. LLM analysis understands the actual problem.

#### Step 6.1: Ensure graphify-input batch files exist

Check if `$CACHE_DIR/graphify-input/bugs-batch-01.md` exists. If not, run the export script:

```bash
node "$SKILL_DIR/export-for-graphify.mjs"
```

This creates `$CACHE_DIR/graphify-input/bugs-batch-NN.md` files — ~100 bugs per batch, 29 files total for ~2815 bugs. Each bug includes number, title, status, date, URL, body text, device info.

#### Step 6.2: Check categorization cache

Check if `$CACHE_DIR/cats-01.json` through `cats-05.json` exist. Each file has a JSON array of `{"n": bug_number, "rp": "root problem", "cat": "category"}`. If ALL 5 files exist and were written within the last 7 days, skip to Step 6.4.

#### Step 6.3: Dispatch 5 parallel Sonnet agents for categorization

Dispatch **5 agents in a single message** (they MUST be parallel). Each agent reads 5-6 batch files (~500-600 bugs) and **writes** its result to a numbered file using the Write tool.

Agent assignment:
- Agent 1: batches 01-06 → `$CACHE_DIR/cats-01.json`
- Agent 2: batches 07-12 → `$CACHE_DIR/cats-02.json`
- Agent 3: batches 13-18 → `$CACHE_DIR/cats-03.json`
- Agent 4: batches 19-24 → `$CACHE_DIR/cats-04.json`
- Agent 5: batches 25-29 → `$CACHE_DIR/cats-05.json`

Each agent receives this prompt (substitute FILE_LIST, OUTPUT_PATH):

```
You are a bug analyst. Read these files of Telegram WebK bug reports. For EVERY bug, determine the root problem.

Files: FILE_LIST

For EACH bug produce: {"n": bug_number, "rp": "root problem in 5-15 words", "cat": "category"}

Categories: video-playback, audio, calls, downloads, message-input, message-display, message-status, drafts, notifications, stickers-emoji, ui-rendering, scrolling, performance, settings, auth-login, folders-archive, search, media-upload, reactions, polls, keyboard-shortcuts, rtl-layout, bots, premium-payments, contacts, dark-mode, profile, privacy, scheduled-messages, stories, mini-apps, browser-compat, other

Rules:
- Root problem = YOUR diagnosis, not user's words. Standardize similar issues to IDENTICAL strings.
- "video not playing" and "can't watch video" → SAME rp
- "video not playing" and "no audio in video" → DIFFERENT rp (playback failure vs audio codec)
- "can't download" and "download is slow" → DIFFERENT rp (failure vs speed)
- Vague reports (title is just "bug") → rp: "report too vague to determine root cause", cat: "other"
- You MUST include EVERY bug, no skipping

IMPORTANT: After building the JSON array, WRITE IT to OUTPUT_PATH using the Write tool. Write ONLY valid JSON array.
```

Use `model: "sonnet"` for all 5 agents. Estimated time: ~7 minutes total (parallel).

#### Step 6.4: Merge and find duplicates

```python
import json, re
from pathlib import Path
from collections import defaultdict

CACHE = Path('C:/Users/user/tweb/.claude/bugs-cache')

# Merge all categorized files
all_bugs = []
for i in range(1, 6):
    fp = CACHE / f'cats-0{i}.json'
    data = json.loads(fp.read_text(encoding='utf-8'))
    all_bugs.extend(data)

# Deduplicate by bug number
seen = set()
unique = []
for b in all_bugs:
    if b['n'] not in seen:
        seen.add(b['n'])
        unique.append(b)

# Group by exact root_problem string
rp_groups = defaultdict(list)
for b in unique:
    rp = b.get('rp', '').lower().strip()
    if rp != 'report too vague to determine root cause':
        rp_groups[rp].append(b)

# Duplicate groups = root problems with 2+ bugs
dupes = {rp: entries for rp, entries in rp_groups.items() if len(entries) >= 2}
```

#### Step 6.5: Build graphify graph

Create a graphify extraction where each duplicate group is a hub node connected to its member bugs:

```python
nodes = []
edges = []
for rp, entries in dupes.items():
    rp_id = 'rp_' + re.sub(r'[^a-z0-9]+', '_', rp)[:60]
    nodes.append({'id': rp_id, 'label': rp.title(), 'file_type': 'document', ...})
    for entry in entries:
        bug_id = f'bug_{entry["n"]}'
        nodes.append({'id': bug_id, 'label': f'#{entry["n"]}: {title}', ...})
        edges.append({'source': bug_id, 'target': rp_id, 'relation': 'has_root_problem', ...})
```

Run through graphify pipeline (build → cluster → visualize):
```python
from graphify.build import build_from_json
from graphify.cluster import cluster
from graphify.export import to_json, to_html
G = build_from_json(extraction)
communities = cluster(G)
to_json(G, communities, 'graphify-out/graph_semantic.json')
to_html(G, communities, 'graphify-out/graph_semantic.html')
```

#### Step 6.6: Generate report

Write `$CACHE_DIR/graphify-semantic-duplicates-report.md` with:
- Summary metrics (total bugs, groups, coverage)
- All duplicate groups sorted by size (largest first)
- Each group: root_problem, category, table of bug numbers with titles/status/votes
- Category distribution table

#### Cache files produced

```
bugs-cache/
├── cats-01.json through cats-05.json    — per-agent categorizations
├── all-bugs-categorized.json            — merged categorizations
├── graphify-semantic-duplicates-report.md — final report
└── graphify-input/graphify-out/
    ├── graph_semantic.json              — graphify graph
    └── graph_semantic.html              — interactive visualization
```

## Important Notes

- Issues labeled `enhancement` or `feature` are NOT bugs — exclude them unless they describe broken behavior
- Pull requests appear in the GitHub issues API — filter them out (`pull_request` field is null for real issues)
- On bugs.telegram.org, many issues are marked "Fixed" — filter by `--status open` to focus on unfixed bugs
- Use the issue body + title + labels to infer severity; many issues won't have explicit labels
- When in doubt about a score, be conservative (score lower)
- The LLM analysis step should process issues in batches to stay within context limits
- The Telegram scraper respects rate limits (300ms between requests) — a full scrape with `--detailed` takes several minutes for large datasets
- The `--detailed` flag is recommended for accurate scoring since list-page previews are truncated
