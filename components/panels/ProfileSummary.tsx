import type { LifeProfile } from "@/lib/contracts";

const knownText = (value: string | null | undefined) => {
  const text = value?.trim();
  return text && text.toLowerCase() !== "unknown" ? text : null;
};

const yearRange = (start: number | null, end: number | null) => {
  if (start != null && end != null) return `${start}–${end}`;
  if (start != null) return `${start}–now`;
  if (end != null) return `until ${end}`;
  return null;
};

export default function ProfileSummary({ profile }: { profile: LifeProfile }) {
  const { person } = profile;
  const displayName = knownText(person.display_name) ?? "Her life";
  const hometown = knownText(person.hometown);
  const personMeta = [
    person.birth_year != null ? `born ${person.birth_year}` : null,
    hometown ? `hometown ${hometown}` : null,
  ].filter(Boolean);
  return (
    <>
      <div className="eyebrow">Life profile</div>
      <h2>{displayName}</h2>
      {personMeta.length > 0 && <p className="result-meta">{personMeta.join(" · ")}</p>}
      {profile.eras.map((era) => {
        const eraMeta = [yearRange(era.start_year, era.end_year), knownText(era.age_range) ? `age ${era.age_range}` : null].filter(Boolean);
        return (
          <section className="result-section" key={era.id}>
            {eraMeta.length > 0 && <span className="section-label">{eraMeta.join(" · ")}</span>}
            {knownText(era.label) && <strong className="intent">{era.label}</strong>}
            <ul className="place-list">
              {era.places.map((place) => (
                <li key={place.id}>
                  <b lang="ko">{place.name_then}</b>
                  <small>{place.geo ? `today: ${place.geo.display_name}` : "not found on today's map"}</small>
                  <q lang="ko">{place.evidence_quote}</q>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {profile.habits.length > 0 && (
        <section className="result-section">
          <span className="section-label">Habits</span>
          <ul className="place-list">
            {profile.habits.map((h) => (
              <li key={h.text}>
                <b>{h.text}</b>
                <q lang="ko">{h.evidence_quote}</q>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
