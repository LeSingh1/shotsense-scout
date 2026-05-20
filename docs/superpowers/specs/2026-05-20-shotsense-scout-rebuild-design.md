# ShotSense Scout Rebuild — Design Spec

**Date:** 2026-05-20
**Status:** Draft
**Approach:** Hybrid pre-computed stats + live Claude agent (Approach C)

## Overview

Rebuild ShotSense Scout from a MongoDB hackathon xFG model showcase into an AI basketball coaching intelligence tool. The core value proposition shifts from "here are shot quality stats" to "here is what changed, why it matters, and what a coach should do next."

The rebuild keeps the existing repo infrastructure (MongoDB Atlas, XGBoost xFG model, data pipeline, Gemini embeddings for vector search) and replaces the frontend and agent layer entirely.

## Data Source

2025-26 NBA playoff data only. ~10,500 shots already in MongoDB Atlas (`shotsense.shots`). No new data fetching required. The dataset is fixed — all computation can happen at build time.

## Architecture

```
BUILD TIME (Python scripts):
  MongoDB (10.5k shots)
    -> scripts/build_stats.py
    -> player_profiles.json, team_profiles.json, game_logs.json
    -> scripts/detect_patterns.py
    -> patterns.json

NEXT.JS (static + API routes):
  Static: JSON loaded at build time, rendered into 3-panel dashboard
  /api/scout-report: Claude generates structured scouting reports
  /api/chat: Claude answers questions with live MongoDB tool access

AI LAYER:
  Claude (Anthropic API): scout reports, chat, tactical analysis
  Gemini embeddings: vector search for similar shots (existing)
  
DATA LAYER:
  MongoDB Atlas: raw shots, players, reports, vector index
  Pre-computed JSON: player profiles, team profiles, game logs, patterns
```

## 1. Data Layer & Pre-Computed Stats

### Existing infrastructure (kept as-is)

- MongoDB Atlas cluster with `shotsense` database
- Collections: `shots` (10.5k records), `players` (217), `reports`, `agent_memory`
- Vector search index `shot_summary_vector_index` on `shots.summary_embedding` (768 dims, cosine)
- Gemini embeddings via `scripts/build_embeddings.py`
- XGBoost xFG model in `nba_shot_quality/`
- `scripts/import_to_mongodb.py`, `scripts/export_for_frontend.py`

### New build scripts

**`scripts/build_stats.py`** reads all shots from MongoDB and produces:

**`frontend/data/player_profiles.json`** — One entry per player:
- `player_name`, `player_id`, `team`
- `games_played`, `total_shots`, `overall_fg_pct`, `overall_xfg`
- `zones`: object keyed by zone name, each containing:
  - `attempts`, `makes`, `fg_pct`, `xfg`
  - `recent` (last 3 games): same stats scoped to recent window
  - `delta`: `recent.fg_pct - fg_pct` (positive = heating up, negative = cooling)

Zone names: `restricted_area`, `paint_non_ra`, `midrange_left`, `midrange_center`, `midrange_right`, `left_corner_3`, `right_corner_3`, `above_break_3`

These zones map to the NBA's standard shot zone classifications available in the `nba_api` shot detail data. The `shot_zone_basic` and `shot_zone_area` fields in each shot record are combined to determine zone assignment.

**`frontend/data/team_profiles.json`** — One entry per team:
- `team_name`, `team_abbr`
- `games_played`, `total_shots`, `overall_fg_pct`
- `zones`: same structure as player zones
- `shot_distribution`: percentage of attempts in each zone
- `paint_attempts_per_game`, `three_point_rate`

**`frontend/data/game_logs.json`** — Array of per-player, per-game rows:
- `player_name`, `player_id`, `game_date`, `opponent`, `game_id`
- `shots_attempted`, `shots_made`, `fg_pct`, `mean_xfg`
- `zone_breakdown`: per-zone attempts and makes for that game
- `quarter_breakdown`: per-quarter attempts, makes, fg_pct

**`frontend/data/patterns.json`** — Output of the pattern detection engine (see Section 2).

Existing files (`ranking.json`, `shots.json`, `hex.json`, `fold_metrics.json`, `calibration.json`, `meta.json`) are retained for any components that still reference them, but are not central to the new UI.

## 2. Pattern Detection Engine

**`scripts/detect_patterns.py`** runs at build time over game logs and player profiles. Produces `patterns.json`.

### Pattern types

**Cold Zone** — Player's FG% in a specific zone over last 3+ games is 15+ percentage points below their playoff average in that zone. Minimum 5 attempts in the window to filter noise.

**Hot Zone** — Inverse of cold zone. FG% 15+ percentage points above average over recent games. Same 5-attempt minimum.

**Shot Profile Shift** — Player's shot distribution has changed. Recent-window zone distribution compared to full-playoff distribution. Flagged when any single zone shifts by 10+ percentage points (e.g., midrange share went from 20% to 35%). Measured as absolute percentage-point change in share of total attempts.

**Efficiency Drop** — Player's per-game FG% has a negative linear slope over a sliding window of 3+ games, steeper than -5 percentage points per game. Calculated via ordinary least squares on the per-game FG% sequence.

**Volume Change** — Player's shots-per-game in the recent window differs from their playoff average by 25%+. Computed as `abs(recent_avg - season_avg) / season_avg`.

**Late-Game Fade** — Player's 4th quarter + OT combined FG% is 10+ percentage points worse than their 1st-3rd quarter combined FG%. Minimum 10 attempts in each bucket (Q1-Q3 and Q4+OT) to filter noise.

### Pattern record schema

```json
{
  "player_name": "Jalen Brunson",
  "player_id": 1629713,
  "pattern_type": "cold_zone",
  "zone": "right_corner_3",
  "severity": 0.73,
  "direction": "negative",
  "evidence": {
    "recent_fg_pct": 0.18,
    "baseline_fg_pct": 0.42,
    "recent_attempts": 11,
    "recent_window_games": 4,
    "delta": -0.24
  },
  "summary": "Brunson's right corner 3P% dropped from 42% to 18% over his last 4 games (11 attempts).",
  "games_window": ["2026-04-20", "2026-04-22", "2026-04-25", "2026-04-27"]
}
```

`severity` is a 0-1 float. Normalized within each pattern type: for zone-based patterns, it's `abs(delta) / max_possible_delta` clamped to [0, 1]. For efficiency drop, it's the slope magnitude normalized against the steepest observed drop. This lets the frontend sort and prioritize patterns across types.

`direction` is `"positive"` for hot zones, efficiency gains, and volume increases; `"negative"` for cold zones, drops, and fades.

Summaries are template-generated in Python, not AI-generated. They follow the form: "[Player]'s [metric] [changed] from [baseline] to [recent] over [window] ([sample size])."

### Why rule-based

Patterns are deterministic and auditable. A coach sees the exact threshold that triggered each alert. AI enters at the interpretation layer (scout reports) to explain why a pattern matters tactically and what to do about it. Separating detection from interpretation makes both trustable.

## 3. AI Scout Reports (Claude)

### API route: `app/api/scout-report/route.ts`

**Input:** POST with `{ player_id }` (and optionally `{ focus_pattern_type }` to narrow the report).

**Context assembled for Claude:**
- Player's full profile from `player_profiles.json`
- Player's game logs from `game_logs.json`
- All detected patterns for this player from `patterns.json`
- Player's team profile from `team_profiles.json`

**System prompt instructs Claude to act as a veteran NBA scout.** It receives structured data and produces a structured report — not free-form prose.

**Response schema (enforced via Claude tool use):**

```json
{
  "main_finding": "One sentence: the single most important thing a coach should know.",
  "why_it_matters": "2-3 sentences of basketball context. Defensive adjustments, matchup implications, fatigue signals, scheme vulnerabilities.",
  "evidence": [
    {
      "stat": "Right corner 3P%",
      "baseline": "42%",
      "recent": "18%",
      "window": "Last 4 games",
      "sample": "11 attempts"
    }
  ],
  "suggested_adjustment": "A concrete tactical recommendation. Play calls, lineup changes, defensive schemes, or practice focus areas.",
  "confidence": 8,
  "confidence_rationale": "Why this confidence level — sample size, consistency of signal, number of corroborating patterns."
}
```

`confidence` is an integer 1-10. Claude is instructed to factor in sample size, pattern severity, and whether multiple patterns corroborate each other.

**Auto-generation:** When a player is selected, the frontend calls this route automatically with the player's highest-severity pattern as the focus. The user can also click "Full Report" to get a comprehensive report covering all detected patterns.

**Persistence:** Reports are saved to MongoDB `shotsense.reports` collection with `player_id`, `generated_at`, and the full structured response. This lets users revisit past reports and lets "Ask the Scout" reference them.

### AI provider

Claude via the Anthropic TypeScript SDK (`@anthropic-ai/sdk`). Model: `claude-sonnet-4-6` for both scout reports and chat (fast, good at structured output and tool use). The API key is stored as `ANTHROPIC_API_KEY` in `.env` and accessed server-side only. Both routes use streaming (`stream: true`) so the frontend can render responses incrementally.

## 4. "Ask the Scout" Chat

### API route: `app/api/chat/route.ts`

**Input:** POST with `{ messages, context }` where:
- `messages`: conversation history (array of `{ role, content }`)
- `context`: current UI state — selected player, active filters, visible patterns

**Claude's system prompt** establishes it as a veteran scout with access to NBA playoff data. It receives:
- Pre-computed player/team profiles and patterns as context
- Three tools for live data access

### Tools

**`query_shots`** — Retrieve filtered shot records from MongoDB.
- Parameters: `player_name?`, `team?`, `game_id?`, `zone?`, `quarter?`, `shot_type?`, `made?`, `limit` (default 50, max 200)
- Returns: array of shot records with all fields
- Implementation: builds a MongoDB `find()` query from the parameters

**`aggregate_stats`** — Run a read-only MongoDB aggregation.
- Parameters: `pipeline` (array of aggregation stages)
- Guardrails:
  - Collection whitelist: `shots`, `players` only
  - Blocked stages: `$out`, `$merge`, `$collStats`, `$currentOp`, `$listSessions`
  - Max 10 pipeline stages
  - 5-second server-side timeout (`maxTimeMS: 5000`)
- Returns: aggregation result array

**`search_similar_shots`** — Atlas Vector Search for shots with similar characteristics.
- Parameters: `shot_id` (seed shot to find similar ones), `limit` (default 5, max 20)
- Uses the existing `shot_summary_vector_index`
- Returns: array of similar shots with similarity scores

### Conversation management

- History is kept client-side in `chatStore` (Zustand)
- Full conversation history is sent with each request so Claude maintains context
- No server-side session persistence — refreshing the page clears chat
- Max 20 messages per conversation before the frontend suggests starting a new one (to stay within context limits)

### Guardrails

- Read-only MongoDB access only (no writes from chat)
- Collection whitelist enforced server-side before executing any tool call
- 5-second timeout on all MongoDB operations
- Rate limit: 10 messages per minute per client (enforced via simple in-memory counter in the API route, reset on deploy — sufficient for a passion project)
- Claude's system prompt explicitly instructs it to cite evidence for claims and acknowledge when sample sizes are too small to draw conclusions

## 5. Visual Design — Full Redesign

### Color system: Court Wood + Warm Tones

The visual identity draws from basketball court materials — hardwood, leather, warm lighting. Dark mode, but warm instead of cold.

```
Core:
  --bg:           #1a1410   (dark walnut — page background)
  --surface:      #241e17   (warm dark — card/panel backgrounds)
  --surface-2:    #2e2620   (slightly lighter — hover states, elevated surfaces)
  --border:       #3d332a   (warm border)

Text:
  --text:         #f5e6d3   (cream — primary text)
  --text-muted:   #a89580   (muted cream — secondary text, labels)
  --text-dim:     #6b5d4f   (dim — tertiary, timestamps)

Accents:
  --accent:       #e8732a   (burnt orange — primary accent, CTAs, makes)
  --accent-hover: #f58a3e   (lighter orange — hover state)
  --navy:         #2d4a7a   (deep navy — secondary accent, misses)
  --navy-light:   #4a6fa5   (steel blue — miss dots, secondary data)

Semantic:
  --positive:     #e8732a   (burnt orange — makes, hot zones, positive patterns)
  --negative:     #4a6fa5   (steel blue — misses, cold zones, negative patterns)
  --confidence:   #c4933d   (warm gold — confidence badges)
  --warning:      #d4783a   (warm amber — medium severity)
```

### Typography

- **Headlines:** Inter or Satoshi — geometric sans-serif, tight tracking (-0.03em), large sizes for section headers
- **Body:** Inter — clean, highly legible at small sizes for stat labels and report text
- **Data/Numbers:** JetBrains Mono or IBM Plex Mono — monospace for all stats, percentages, and pipeline JSON. Tabular nums enabled for alignment.
- **Scale:** 12px (labels) / 14px (body) / 16px (large body) / 24px (section) / 32-48px (hero stats)

### Layout: 3-Panel Coaching Dashboard

```
┌──────────────────────────────────────────────────────────────────┐
│  TOPBAR: ShotSense Scout logo  |  Player search  |  Settings    │
├────────────┬─────────────────────────┬───────────────────────────┤
│            │                         │                           │
│  FILTERS   │     COURT SHOT MAP      │   SCOUT INTELLIGENCE      │
│            │                         │                           │
│  Player    │                         │  ┌── Scout Report ──────┐ │
│  Team      │     ○  ●  ●            │  │                      │ │
│  Games     │   ●    ○   ○  ●        │  │  Main finding        │ │
│  Shot type │     ○  ●     ●  ○      │  │  Why it matters      │ │
│  Quarter   │        ●  ○            │  │  Evidence             │ │
│            │   ○      ●             │  │  Adjustment           │ │
│  ────────  │                         │  │  Confidence: 8/10    │ │
│            │  Mode: ● Dots ○ Hex    │  │                      │ │
│  PATTERNS  │        ○ Heat          │  └──────────────────────┘ │
│            │                         │                           │
│  ┌──────┐  │  Legend:                │  ┌── Ask the Scout ────┐ │
│  │ Cold │  │  ● Make (orange)       │  │                      │ │
│  │ zone │  │  ○ Miss (steel blue)   │  │  > Why is Brunson    │ │
│  └──────┘  │                         │  │    cold from the     │ │
│  ┌──────┐  │                         │  │    corner?           │ │
│  │ Shot │  │                         │  │                      │ │
│  │ shift│  │                         │  │  Because defenses... │ │
│  └──────┘  │                         │  │                      │ │
│  ┌──────┐  │                         │  └──────────────────────┘ │
│  │ Fade │  │                         │                           │
│  └──────┘  │                         │                           │
├────────────┴─────────────────────────┴───────────────────────────┤
│  FOOTER: Data source · Model info · Season                       │
└──────────────────────────────────────────────────────────────────┘
```

**Left panel (280px fixed):**
- Filters section at top: each filter is a compact dropdown or toggle group
- Divider
- Patterns section below: scrollable list of `PatternCard` components
- Each pattern card shows: icon (zone/trend/clock), one-line summary, severity bar
- Clicking a pattern: highlights the relevant zone on the court map, scrolls the scout report to focus on that pattern
- Panel has a subtle warm gradient border on the right edge

**Center panel (flexible, fills remaining space):**
- SVG half-court occupying the full panel width
- Three view modes toggled via segmented control: Dots (individual shots), Hex (hex bins), Heat (zone-based heat map)
- Dots mode: each shot is a circle — burnt orange for makes, steel blue for misses. Opacity scales with xFG (higher xFG = more opaque, showing "expected" makes). Size is uniform (r=3).
- Hover on a dot: tooltip card appears with game date, opponent, quarter, time, distance, zone, xFG%, made/missed
- When a pattern is selected in the left panel, the relevant zone gets a glowing border overlay (orange glow for hot, blue glow for cold)
- Court lines rendered in `--border` color, subtle and not competing with data
- Legend below the court: make/miss color key, xFG opacity explanation

**Right panel (380px fixed):**
- Top section: Scout Report card
  - Header with player name, team logo placeholder (text abbreviation), report timestamp
  - Sections: Main Finding (bold), Why It Matters (body text), Evidence (table of stats), Suggested Adjustment (body text), Confidence (badge with number)
  - "Generate Full Report" button if viewing auto-summary
- Bottom section: "Ask the Scout" chat
  - Input field at bottom with placeholder: "Ask about any player, matchup, or trend..."
  - Messages scroll upward. User messages right-aligned in `--surface-2` bubbles, scout responses left-aligned in `--surface` bubbles
  - Scout responses can contain inline evidence blocks (expandable sections showing the raw data or MongoDB pipeline used)
  - Typing indicator: three-dot animation in `--accent` color

**Topbar (56px):**
- Left: "ShotSense Scout" wordmark in cream, monospace, tight
- Center: global player search (search icon + input that expands)
- Right: minimal — just a settings/info icon

### Responsive behavior

- **Desktop (1200px+):** Full 3-panel layout as described
- **Tablet (768-1199px):** Left panel collapses to an icon rail with filter/pattern toggles. Tapping an icon opens the panel as an overlay. Court and scout panel stack vertically.
- **Mobile (<768px):** Single column. Topbar with hamburger for filters. Court map (full width). Scout report below. Chat accessed via a floating action button that opens a bottom sheet. Patterns in a horizontal scrollable chip row above the court.

### Animations (Motion / Framer Motion)

- Panel transitions: slide in/out with spring physics (stiffness: 300, damping: 30)
- Shot dots: fade in with stagger (50ms between dots) when filters change
- Pattern cards: subtle scale on hover (1.02), press (0.98)
- Zone overlay glow: pulse animation (opacity 0.3 to 0.6, 2s cycle)
- Scout report sections: stagger fade-in on load (100ms between sections)
- Chat messages: slide up + fade in
- No animations that block interaction or slow perceived performance. All transitions under 300ms.

### Court SVG specifics

The court rendering reuses the coordinate system from the existing `PlayerShotMap.tsx`: viewBox `0 0 520 480`, with `SHIFT_X = 260` and `SHIFT_Y = 50` to center coordinates. Court lines (three-point arc, paint, free-throw circle, hoop) rendered as strokes in `--border` color.

Zone overlay regions are defined as SVG `<path>` elements matching the NBA's standard zone boundaries:
- Restricted area: circle around hoop (r ~4ft)
- Paint (non-RA): rectangle from baseline to free-throw line, minus RA
- Midrange left/center/right: area between paint and three-point line, divided into thirds
- Left corner 3 / right corner 3: below the break on each side
- Above-break 3: beyond the arc, above the corner regions

These paths are defined once in `lib/court-geometry.ts` and reused by both `ShotMap.tsx` (for dot placement zone detection) and `ZoneOverlay.tsx` (for zone highlighting).

## 6. Component Architecture

```
frontend/
  app/
    page.tsx                        Root: renders Dashboard shell
    layout.tsx                      Fonts, global CSS, metadata
    globals.css                     CSS variables (color system), base styles
    api/
      scout-report/route.ts         Claude scout report generation
      chat/route.ts                 Claude chat with MongoDB tools
  components/
    Layout/
      Dashboard.tsx                 3-panel responsive shell
      Topbar.tsx                    Logo + global search + settings
    Filters/
      FilterPanel.tsx               Left panel: filters + patterns container
      PlayerSelect.tsx              Searchable player dropdown
      TeamSelect.tsx                Team filter dropdown
      GameRangeSlider.tsx           Game range slider
      ShotTypeFilter.tsx            Shot type toggle group
      QuarterFilter.tsx             Quarter selector chips
    Court/
      CourtPanel.tsx                Center panel container + view mode toggle
      ShotMap.tsx                   SVG court with shot dots
      ZoneOverlay.tsx               Hot/cold zone highlight paths
      HexView.tsx                   Hex bin aggregation view
      HeatMap.tsx                   Zone-based heat map view
      ShotTooltip.tsx               Hover detail card for individual shots
      CourtLines.tsx                SVG court line geometry (shared)
    Scout/
      ScoutPanel.tsx                Right panel container
      ReportCard.tsx                Structured scout report display
      ReportSection.tsx             Individual section (finding, evidence, etc.)
      ChatPanel.tsx                 "Ask the Scout" conversation UI
      ChatMessage.tsx               Individual message (user or scout)
      ChatInput.tsx                 Message input + send button
      EvidenceBlock.tsx             Expandable data/query evidence
    Patterns/
      PatternList.tsx               Scrollable pattern card list
      PatternCard.tsx               Individual pattern card
    UI/
      Badge.tsx                     Severity/confidence/pattern-type badges
      Tooltip.tsx                   Shared tooltip component
      Spinner.tsx                   Loading indicator
      SegmentedControl.tsx          Toggle between view modes
  stores/
    playerStore.ts                  Selected player + team
    filterStore.ts                  Shot type, quarter, game range filters
    patternStore.ts                 Patterns list, selected pattern
    chatStore.ts                    Chat messages, loading state
  lib/
    data.ts                         Loads pre-computed JSON files
    types.ts                        All shared TypeScript types
    patterns.ts                     Client-side pattern filtering/sorting
    court-geometry.ts               Court coordinates, zone paths, zone detection
    format.ts                       Number/percentage formatting
    claude.ts                       Server-side Anthropic SDK client
    mongo.ts                        Server-side MongoDB client for chat tools
    chat-tools.ts                   Tool definitions + handlers for chat route
  data/
    player_profiles.json            Pre-computed (build output)
    team_profiles.json              Pre-computed (build output)
    game_logs.json                  Pre-computed (build output)
    patterns.json                   Pre-computed (build output)
    ranking.json                    Existing (kept)
    shots.json                      Existing (kept)
    hex.json                        Existing (kept)
    meta.json                       Existing (kept)
```

### State management

Four Zustand stores, each single-purpose:

**`playerStore`** — `{ selectedPlayer, selectedTeam, players, teams, setPlayer, setTeam }`. Setting a player triggers downstream updates: filters reset to defaults, patterns update to that player's patterns, and a scout report auto-generates.

**`filterStore`** — `{ shotType, quarters, gameRange, setFilter, resetFilters }`. Pure filter state. Court components subscribe to this store to filter which dots/bins render.

**`patternStore`** — `{ patterns, selectedPattern, setSelectedPattern }`. Patterns for the current player. When `selectedPattern` changes, `ZoneOverlay` highlights the zone and `ReportCard` refocuses.

**`chatStore`** — `{ messages, isLoading, addMessage, clearMessages }`. Chat history for the current session. Not persisted.

Stores communicate through React's render cycle. Components subscribe to the stores they need. No cross-store subscriptions or middleware.

### What's deleted

- `components/Hero.tsx`, `Leaderboard.tsx`, `Explorer.tsx`, `Topbar.tsx` (old), `Methodology.tsx`, `Colophon.tsx`, `FoldVisualizer.tsx`, `PageShell.tsx`, `LeaderboardRow.tsx`
- `components/nike/` (entire directory)
- `hooks/useBallTracking.ts`, `hooks/useMoveNet.ts` (TensorFlow pose detection)
- `components/AgentPanel.tsx` (replaced by Scout panel)
- `app/api/agent/route.ts` (replaced by two new API routes)
- `lib/agent-tools.ts` (Gemini Agent Builder tools)
- `lib/replay-samples/` (replay mode replaced by real Claude calls)

### What's adapted

- `components/PlayerShotMap.tsx` SVG geometry -> foundation for `Court/ShotMap.tsx` and `Court/CourtLines.tsx`
- `components/Court.tsx` hex bin logic -> adapted into `Court/HexView.tsx`
- `components/HexBin.tsx` -> reused inside `HexView.tsx`
- `lib/data.ts` loader pattern -> rebuilt for new JSON structure
- `lib/types.ts` -> rebuilt with new types

## 7. Data Flow

### Build time

```
MongoDB Atlas (shotsense.shots, 10.5k records)
  |
  v
scripts/build_stats.py
  |-> frontend/data/player_profiles.json
  |-> frontend/data/team_profiles.json
  |-> frontend/data/game_logs.json
  |
  v
scripts/detect_patterns.py (reads the above JSON files)
  |-> frontend/data/patterns.json
```

These scripts are added to the Makefile:

```makefile
stats:
	$(VENV)/bin/python scripts/build_stats.py

patterns:
	$(VENV)/bin/python scripts/detect_patterns.py

build-data: stats patterns
```

### Page load

1. Next.js reads all JSON at build time (server component, no runtime fetch)
2. `playerStore` populated with all players
3. Default player selected (player with the most total playoff shots in the dataset)
4. Court renders that player's shots
5. `PatternList` renders detected patterns for that player
6. Auto-call to `/api/scout-report` generates an initial report focused on the top pattern

### User interactions

**Select player:** `playerStore.setPlayer()` -> filters reset -> court re-renders with new player's shots -> pattern list updates -> new scout report auto-generates.

**Change filter:** `filterStore.setFilter()` -> court dots filter client-side (no API call, data is pre-loaded) -> pattern card relevance may shift (e.g., filtering to Q4 makes "Late-Game Fade" pattern more prominent).

**Select pattern:** `patternStore.setSelectedPattern()` -> `ZoneOverlay` highlights the zone on court -> `ReportCard` re-generates focused on that pattern.

**Ask the Scout:** User types question -> `chatStore.addMessage()` -> POST to `/api/chat` with messages + context -> Claude reasons, possibly calls MongoDB tools -> response streamed back -> `chatStore.addMessage()` with response.

### Chat tool execution flow

```
Frontend -> POST /api/chat { messages, context }
  -> API route builds Claude request with system prompt + tool definitions
  -> Claude responds (possibly with tool_use blocks)
  -> For each tool call:
     -> Validate against guardrails (collection whitelist, blocked stages, timeout)
     -> Execute against MongoDB Atlas
     -> Return result to Claude
  -> Claude produces final text response with evidence
  -> Stream response back to frontend
```

## 8. Environment Variables

Existing (unchanged):
- `MONGODB_URI` — Atlas connection string
- `MONGODB_DB` — Database name (`shotsense`)
- `GEMINI_API_KEY` — Gemini embeddings (for vector search tool in chat)

New:
- `ANTHROPIC_API_KEY` — Claude API key for scout reports and chat

Removed:
- `AGENT_BUILDER_ENDPOINT` — No longer using Gemini Agent Builder
- `EMBEDDING_PROVIDER` — Kept but not relevant to the new frontend
- `EMBEDDING_OVERWRITE` — Kept but not relevant to the new frontend

## 9. Dependencies

### New npm packages

- `@anthropic-ai/sdk` — Claude API client
- No other new dependencies. The existing stack (Next.js 15, React 19, Tailwind v4, Motion, MongoDB driver, Three.js/R3F, Zod) covers everything.

### Removed npm packages

- `@tensorflow-models/pose-detection` — No longer using pose detection
- `@tensorflow/tfjs` — No longer using TensorFlow
- `@tensorflow/tfjs-backend-webgl` — No longer using TensorFlow

### Python (no changes)

Existing `requirements-agent.txt` covers MongoDB and Gemini. New scripts (`build_stats.py`, `detect_patterns.py`) use only `pymongo` (already installed) and stdlib.

## 10. Scope Boundaries

### In scope

- Full frontend rebuild with 3-panel coaching dashboard
- Pre-computed stat engine (build_stats.py + detect_patterns.py)
- 6 pattern detection types (rule-based)
- Claude-powered scout reports with structured output
- "Ask the Scout" chat with live MongoDB tool access
- New color theme (court wood + warm tones)
- Responsive design (desktop, tablet, mobile)
- Makefile targets for build pipeline

### Out of scope

- User authentication / accounts
- Real-time data updates (dataset is fixed)
- Defender tracking data (not available in nba_api free tier)
- Team-vs-team matchup analysis (possible future addition)
- Video highlights integration
- Push notifications or alerts
- Deployment configuration (Vercel setup, Atlas network config)
- The 3D shot replay feature (existing Three.js/R3F code is removed with the old UI; could be re-added later as an enhancement)
