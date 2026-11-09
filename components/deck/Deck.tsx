"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

import numberData from "@/data/numbers.json";
import styles from "./deck.module.css";

type NumberCard = (typeof numberData.numbers)[number];

const SLIDE_COUNT = 7;

function numberById(id: string): NumberCard {
  const card = numberData.numbers.find((entry) => entry.id === id);
  if (!card) throw new Error(`Missing number card: ${id}`);
  return card;
}

function shortUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Sources({ ids }: { ids: string[] }) {
  const sources = ids
    .map(numberById)
    .filter(
      (card, index, cards) =>
        cards.findIndex((candidate) => candidate.source_url === card.source_url) === index,
    );

  return (
    <footer className={styles.sources}>
      {sources.map((source, index) => (
        <Fragment key={source.source_url}>
          {index > 0 && <span aria-hidden="true"> · </span>}
          <a href={source.source_url}>
            {source.source_name} · {shortUrl(source.source_url)}
          </a>
        </Fragment>
      ))}
    </footer>
  );
}

function SinceNineCounter() {
  const rate = numberById("K1-rate");
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const seoul = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(now);
      const part = (type: Intl.DateTimeFormatPartTypes) =>
        Number(seoul.find((item) => item.type === type)?.value);
      const minutesNow = part("hour") * 60 + part("minute");
      const minutesSinceNine = minutesNow - 9 * 60;
      setCount(
        minutesSinceNine < 0
          ? null
          : Math.floor(minutesSinceNine / Number(rate.value)),
      );
    };

    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [rate.value]);

  return (
    <div className={styles.rateLines}>
      <p>
        One report every ~{Math.round(Number(rate.value))} minutes, on average (
        {rate.period.match(/\d{4}/)?.[0] ?? rate.period})
      </p>
      {count !== null && (
        <p>
          Since 9:00 AM today: <strong>~{count.toLocaleString("en-US")}</strong>{" "}
          reports in Korea
        </p>
      )}
    </div>
  );
}

function Stat({ id, compact = false }: { id: string; compact?: boolean }) {
  const card = numberById(id);
  return (
    <div className={compact ? styles.statCompact : styles.stat}>
      <strong>{card.value}</strong>
      <span>{card.label}</span>
    </div>
  );
}

function Quote({ id }: { id: string }) {
  const card = numberById(id);
  return (
    <blockquote className={styles.quote}>
      {card.value}
      <cite>{card.label}</cite>
    </blockquote>
  );
}

function JapanStat() {
  const card = numberById("J7a");
  const [missing, dead] = card.value.split(" / ");

  return (
    <div className={`${styles.statCompact} ${styles.japanStat}`}>
      <span>
        <strong>{missing}</strong> went missing in Japan, {card.period}
      </span>
      <span>
        <strong>{dead}</strong> found dead
      </span>
    </div>
  );
}

function PhoneTrackingGap() {
  const tracked = numberById("K2e");
  const average = numberById("K2a");
  const adoption = numberById("K5a");
  const police = numberById("K6");
  const noPhone = police.label.split(", so")[0];

  return (
    <>
      <h2 className={styles.toolQuestion}>Can&apos;t you just track the phone?</h2>
      <div className={styles.trackingContrast}>
        <div className={styles.trackedStat}>
          <strong>{tracked.value}</strong>
          <span>with a GPS tracker</span>
        </div>
        <span className={styles.versus}>vs</span>
        <div className={styles.averageStat}>
          <strong>{average.value}</strong>
          <span>average</span>
        </div>
      </div>
      <div className={styles.trackingReality}>
        <div className={styles.adoptionStat}>
          <strong>{adoption.value}</strong>
          <span>{adoption.label}</span>
        </div>
        <p className={styles.phoneQuote}>
          <span>{noPhone}.</span> {police.value}
        </p>
      </div>
    </>
  );
}

const slides = [
  <section className={`${styles.slide} ${styles.opening}`} key="opening">
    <p className={styles.eyebrow}>My grandmother has dementia.</p>
    <h1>
      She isn&apos;t lost in space.
      <em>She&apos;s lost in time.</em>
    </h1>
  </section>,
  <section className={styles.slide} key="scale">
    <p className={styles.eyebrow}>This is not a rare emergency.</p>
    <div className={styles.heroStat}>
      <Stat id="K1" />
      <SinceNineCounter />
    </div>
    <div className={styles.statRow}>
      <JapanStat />
      <Stat id="K4" compact />
    </div>
    <Sources ids={["K1", "K1-rate", "J7a", "K4"]} />
  </section>,
  <section className={styles.slide} key="clock">
    <p className={styles.eyebrow}>The clock is already running.</p>
    <div className={styles.threeStats}>
      <Stat id="G8b" />
      <Stat id="G8a" />
      <Stat id="K2a" />
    </div>
    <Sources ids={["G8b", "G8a", "K2a"]} />
  </section>,
  <section className={styles.slide} key="tools">
    <p className={styles.eyebrow}>Today&apos;s tools find where she is now.</p>
    <PhoneTrackingGap />
    <Sources ids={["K2e", "K2a", "K5a", "K6"]} />
  </section>,
  <section className={styles.slide} key="experts">
    <p className={styles.eyebrow}>The experts already know.</p>
    <div className={styles.quoteGrid}>
      <Quote id="G8c" />
      <Quote id="G8d" />
    </div>
    <div className={styles.protocolRow}>
      <Stat id="G10c" compact />
      <Quote id="G10b" />
    </div>
    <p className={styles.cardLine}>The manual asks for it. Nobody computes it.</p>
    <Sources ids={["G8c", "G8d", "G10c", "G10b"]} />
  </section>,
  <section className={styles.slide} key="product">
    <h2>
      Her words tell you <em>WHEN</em> she is.
      <span>Her family tells you <em>WHERE</em> that is.</span>
    </h2>
    <div className={styles.flow} aria-label="Words become an era, then places on today's map">
      <div>
        <span>spoken clues</span>
        <strong>words</strong>
      </div>
      <i aria-hidden="true">→</i>
      <div>
        <span>young adulthood</span>
        <strong>era</strong>
      </div>
      <i aria-hidden="true">→</i>
      <div>
        <span>home · station · factory</span>
        <strong>places on today&apos;s map</strong>
      </div>
    </div>
  </section>,
  <section className={`${styles.slide} ${styles.closing}`} key="closing">
    <p className={styles.closeLead}>
      Korea already asks families to pre-register fingerprints ({numberById("K3a").value}).
      <span>We add one question: where would she go home to?</span>
    </p>
    <h2>Ribot</h2>
    <p className={styles.tagline}>Search where she&apos;s from.</p>
    <a className={styles.repo} href="https://github.com/jooneyp/ribot">
      github.com/jooneyp/ribot
    </a>
    <p className={styles.nameNote}>Named for {numberById("G12").value}: {numberById("G12").label}.</p>
    <Sources ids={["K3a", "G12"]} />
  </section>,
];

export function Deck() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const requested = Number(new URLSearchParams(window.location.search).get("n"));
    if (Number.isInteger(requested)) {
      setActive(Math.min(SLIDE_COUNT, Math.max(1, requested)) - 1);
    }
  }, []);

  const move = useCallback((delta: number) => {
    setActive((current) => Math.min(SLIDE_COUNT - 1, Math.max(0, current + delta)));
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("n", String(active + 1));
    window.history.replaceState({}, "", url);
  }, [active]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", " ", "PageDown"].includes(event.key)) {
        event.preventDefault();
        move(1);
      }
      if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
        event.preventDefault();
        move(-1);
      }
      if (event.key === "Home") setActive(0);
      if (event.key === "End") setActive(SLIDE_COUNT - 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move]);

  return (
    <main
      className={styles.deck}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a")) return;
        move(event.clientX < window.innerWidth / 3 ? -1 : 1);
      }}
    >
      <div className={styles.frame}>
        {slides[active]}
      </div>
    </main>
  );
}
