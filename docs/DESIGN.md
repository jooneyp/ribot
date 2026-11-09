# Ribot — design (frozen at 10:15, c0mpiled-17 Seoul)

Ribot turns a missing person with dementia's own words into the era of her life she is living in, and joins it with a family-filled life profile to rank that era's places on today's map.
Source of the idea: Koester, *Lost Person Behavior*, dementia chapter: "Figure out where in the past the subject is currently living." (data/numbers.json G8c)

Deliverable = a 90-second screen-recorded video + this repo. Every screen in the video is this app. So: few features, each one works and reads well at 1080p.

## Scenes the app must support (in video order)
1. **Hook (case `hook-1962`)** — her 5 lines type out one by one → button "Where is she?" → `/api/era` result appears ("Living in: … · age ~N" + highlighted evidence quotes) → 1 s pause → button "Reveal" shows `family_words[0]` (the son's line) + source link. The app guesses first; the reveal comes from the article. If the model's answer differs, show it as-is.
2. **Hero replay (case `replay-srt`)** — report words + hometown → era/intent → plan: gray radius circle around home vs hometown pin far outside it + "Send first" departure hubs (train icon, "proposed, verify"). Visible on-screen note from `profile_hometown_provenance`. "Reveal" → found pin + distances computed from coordinates.
3. **Second replay (case `replay-naju`)** — circle around Gwangju home vs Naju hometown. Reveal → "found X km from home · Y km from Ribot #1" (computed). Footer: "Replays of published cases; not an accuracy claim."
4. **Then / Now** — for a place with imagery, a drag-to-compare panel: 1970s aerial photo vs today's, same viewport, same public source (국토지리정보원 국토정보플랫폼). Opens from the map pin or automatically after an era result in present mode.
5. **Family profile ("Fill it once")** — upload a 3-min audio file recorded on a phone (or paste text) → transcript → LifeProfile timeline → decade slider moves pins between eras. Optional local-only family photo inside Then/Now. No in-browser recorder.
6. **Deck `/deck`** — 7 slides (story: empathy → numbers → evidence → product), arrow keys, numbers only from `data/numbers.json`, plus a live counter: "Since 9:00 AM today: ~N reports in Korea" using K1-rate (one report every 31.7 min on average; label it "on average").

## Data flow
- `POST /api/era` EraInput → EraEstimate (LLM, quotes kept only if verbatim in input: `lib/quoteGuard.ts`)
- `POST /api/profile` ProfileInput → LifeProfile (geo null; quotes guarded against the text)
- `POST /api/transcribe` multipart `audio` → `{ text }`
- `POST /api/geocode` `{ profile }` → LifeProfile with geo filled (null if not found — never invent coordinates)
- `POST /api/plan` PlanInput → Plan. Candidates = places of eras overlapping the estimated year (+ hometown always), geocoded. score = era_match × reachability × confidence, formula shown in a tooltip. Circle = `circleRadiusKm(elapsed)` (3 km/h, cap 5 km), label the assumption. `send_first` only when rank-1 > 15 km from last seen (LLM proposes hubs, each geocoded).
- `POST /api/replay/run` `{ case_id }` → ReplayRun. Profile is built deterministically from case fields (hometown / past residence), never by the LLM. Hook case → era only, profile/plan null. Last seen = case `home` geocoded at city level; label it "city-level".
- `POST /api/replay/reveal` `{ case_id, plan }` → RevealMetrics using `lib/metrics.ts`. Also write `results/replay_<id>.json` (gitignored).
- `GET /api/imagery` → EraImagery[] (public + local-only).

## Frozen rules for replays and scores (design review 10:10)
- Replay assembly (B): `now_year` = year of case `date` if present, else 2026. If the case has no `her_words` and no `report_words`, skip the LLM and use an EraEstimate with all nulls and intent "unknown" (Naju). `elapsed_hours` = 1, and the circle `assumption` says "demo elapsed time 1 h".
- Candidates: places of eras overlapping `living_in.year_range`; if year_range is null or an era has null years, the era counts as overlapping. `person.hometown` is always a candidate (geocoded) even with no era match.
- Score = era_match × reachability × confidence. era_match = 1 if the era overlaps, else 0.3. reachability = 1 within 5 km; beyond 5 km = 0.8 if intent is going_home/going_to_work, else max(0.2, 1 − km/300). D shows `score_parts` in the tooltip.
- Hook reveal is local UI (family_words[0] + source link); `api.reveal` is only for cases with a plan.
- Finder card is static copy chosen by intent (no LLM call).
- Browser code calls only `lib/api.ts`. `?mock=1` = fixtures, no keys needed. `?present=1` = recording mode (no dev chrome, large type).

## Ownership (one writer per path)
- Joe (frozen): `lib/contracts.ts`, `lib/metrics.ts`, `lib/quoteGuard.ts`, `lib/api.ts`, `app/api/imagery`, `fixtures/**`, `data/**`, `tests/**`, `docs/**`, CI, package.json deps (ask Joe to add a dependency).
- A llm: `lib/llm.ts`, `lib/prompts/**`, `app/api/era`, `app/api/profile`, `app/api/transcribe`, `scripts/smoke-era.sh`
- B geo-plan: `lib/geo.ts`, `lib/plan.ts`, `lib/replay.ts`, `app/api/geocode`, `app/api/plan`, `app/api/replay/**`
- C map: `components/map/**` (MapView, ThenNow)
- D ui: `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `components/panels/**`, `components/Recorder.tsx`
- E deck: `app/deck/**`, `components/deck/**`, `README.md`

## Rules
- No fabricated data: unknown = null and renders "unknown". No accuracy %, no hit rate, no market size, no "first in Korea".
- English UI. Korean quotes and place names shown as-is with English gloss.
- No paid API keys for models. LLM calls go through an OpenAI-compatible endpoint set by `OPENAI_BASE_URL` (here: the local Codex subscription proxy, chat.completions + json_schema); speech-to-text through `RIBOT_STT_BASE_URL` (local Whisper). `.env.local` holds these plus optional KAKAO_REST_KEY and is never committed.
- Family data (photo, local imagery, profile text) stays in `public/local/` and `data/local/` (gitignored). The repo is public.
- Tests: only the four in `tests/` + `tsc`. No E2E, snapshots, coverage. Add a test only for a pure function whose output is shown on screen.

## Out of scope
Auth, database, accounts, multi-user, i18n framework, phone calls, notifications, analytics, real-time tracking, any admin screen.


## Three search layers (design change 11:20, Joon: cover more than "living in the past")
Ribot builds one search plan from her life, in three layers. Her words' intent sets which layer is checked first (`plan.check_order`): heading somewhere (going_home / going_to_work / looking_for_someone) → past first; otherwise routine → near danger → past. Skip empty layers in the UI.
1. **Routine — where she goes alone these days.** Places in the profile era labelled "Now" (`candidate.layer = "routine"`). Why: "58% were engaged in an appropriate and permitted unsupervised activity just prior to the missing incident" (Rowe et al. 2011, data/numbers.json G14).
2. **Near danger — water and hills close to home.** `plan.hazards` (Kakao places in categories 하천/저수지/산 within `plan.hazard_ring_km` = 3.2 km, the manual's urban 75% distance), nearest first. Why: deaths "most commonly occurred in unpopulated areas due to exposure and drowning" and were found "closer to the place last seen" (Rowe 2011, G15).
3. **Past — where she would go back to.** Era places + hometown + departure hubs (`candidate.layer = "past"`). The original Ribot idea.
New replay `replay-uijeongbu` (Yonhap 2025-07-16): searchers assumed the hills near home for three days; she was found on day 4 in brush by a stream. `reveal_mode: "text"` → reveal shows `found.place` / `found.place_en` and `search_note_en` as text (no geocoded reveal). Not an accuracy claim.
