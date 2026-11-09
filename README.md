# Ribot

Ribot turns a missing person with dementia's own words into the era of life they may be living in.
It joins that era to a family-filled life profile and ranks those places on today's map.
It is a focused search-planning demo, built for a 90-second screen-recorded story.

## Scenes

1. **Hook** — infer an era from five verbatim lines, then reveal the family's published account.
2. **Hero replay** — compare the ordinary search radius with a pre-registered hometown and proposed departure hubs.
3. **Second replay** — compare a Gwangju search circle with a Naju hometown, then reveal coordinate-derived distances.
4. **Then / Now** — drag between historical and current aerial imagery of the same viewport.
5. **Fill it once** — turn family audio or pasted text into a life-profile timeline and decade-filtered places.
6. **Deck** — seven 16:9 title cards: empathy, scale, urgency, current tools, evidence, product, and close.

## Run it

```bash
pnpm i

# .env.local
OPENAI_BASE_URL=http://127.0.0.1:8650/v1
OPENAI_API_KEY=unused
KAKAO_REST_KEY=...

pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Add `?mock=1` for fixture-backed flows with no API keys, or `?present=1` for the large-type recording view. The presentation deck is at [`/deck`](http://localhost:3000/deck); link directly to a slide with `?n=3`.

## How it works

1. **Era inference** keeps verbatim evidence from the person's words and rejects non-verbatim model quotes.
2. **Profile** turns family-provided history into eras, places, habits, and provenance. Unknown values remain unknown.
3. **Plan** ranks places from the inferred era, while always including the hometown, and can propose departure hubs for verification.
4. **Reveal** compares the published found location with the plan. Distances and circle inclusion are computed from coordinates rather than claimed by the model.

> Replays of published cases; not an accuracy claim.

## Sources

### Numbers and quoted evidence

- **K1 — 16,586:** [Newsis, Korean National Police Agency data](https://mobile.newsis.com/view/NISX20260902_0003773655)
- **K1-rate — 31.7 minutes:** [Derived from K1 / Newsis](https://mobile.newsis.com/view/NISX20260902_0003773655)
- **J7a — 17,345 / 573:** [National Police Agency of Japan, 令和7年 行方不明者 PDF](https://www.npa.go.jp/publications/statistics/safetylife/R07yukuefumeisha.pdf)
- **K4 — 970,000:** [Korea Ministry of Health and Welfare, 2023 dementia epidemiology survey](https://www.mohw.go.kr/board.es?mid=a10503010100&bid=0027&act=view&list_no=1484959)
- **G8b — 25%:** [Robert Koester, *Lost Person Behavior* — Dementia](https://www.dbs-sar.com/LPB/Dementia.pdf)
- **G8a — 1%:** [Robert Koester, *Lost Person Behavior* — Dementia](https://www.dbs-sar.com/LPB/Dementia.pdf)
- **K2a — 8.2 hours:** [Yonhap, Korean National Police Agency data](https://www.yna.co.kr/view/AKR20241014065400530)
- **K5a — 2.9%:** [Yonhap, Rep. Jang Jong-tae](https://www.yna.co.kr/view/AKR20241014065400530)
- **K3a — 50.2%:** [Newsis, Rep. Seo Young-seok](https://mobile.newsis.com/view/NISX20260902_0003773655)
- **G8c — “Figure out where in the past…”:** [Robert Koester, *Lost Person Behavior* — Dementia](https://www.dbs-sar.com/LPB/Dementia.pdf)
- **G8d — “List locations even if…”:** [Robert Koester, *Lost Person Behavior* — Dementia](https://www.dbs-sar.com/LPB/Dementia.pdf)
- **G10c — George Herbert, 2011:** [Police Scotland, Herbert Protocol](https://www.scotland.police.uk/what-s-happening/news/2021/may/herbert-protocol-introduced-in-the-lothians-and-scottish-borders/)
- **G10b — “Any important past addresses…”:** [Thames Valley Police, Herbert Protocol form](https://www.thamesvalley.police.uk/SysSiteAssets/media/downloads/central/advice/herbert-protocol/herbert-protocol-form.pdf)
- **G12 — Ribot's law (1881):** [Wixted, *Psychological Review* 111(4), 2004](https://pubmed.ncbi.nlm.nih.gov/15482065/)
- **G11a — 2016:** [Sankei News, Iruma City QR nail stickers](https://www.sankei.com/article/20161118-XXLCVNI2ORLONLWETFW2RDVKDU/)
- **G11c — 1999:** [Project Lifesaver International](https://projectlifesaver.org/about-us/)

The canonical values, labels, periods, and verbatim source quotes live in [`data/numbers.json`](data/numbers.json). The deck resolves every displayed fact by its ID from that file.

### Published replay cases

- **hook-1962:** [OhmyNews — responding officer's account](https://www.ohmynews.com/NWS_Web/View/at_pg.aspx?CNTN_CD=A0002963907)
- **replay-srt:** [Hankyoreh — Suseo Station / Iksan train case](https://www.hani.co.kr/arti/society/society_general/1150244.html)
- **replay-naju:** [Seoul Shinmun — Gwangju / Naju case](https://www.seoul.co.kr/news/society/2018/06/29/20180629500066)
- **replay-sinchon:** [Hankyoreh — Bulgwang / Sinchon investigator account](https://www.hani.co.kr/arti/society/society_general/895733.html)

Case fields and provenance live in [`data/cases_replay.json`](data/cases_replay.json). Historical and present-day aerial imagery is sourced from [국토지리정보원 국토정보플랫폼](https://map.ngii.go.kr/).

Built at c0mpiled-17 Seoul, 2026-11-09.
