import type { LifeProfile } from "@/lib/contracts";

export default function ProfileSummary({ profile }: { profile: LifeProfile }) {
  const { person } = profile;
  return (
    <>
      <div className="eyebrow">Life profile</div>
      <h2>{person.display_name}</h2>
      <p className="result-meta">
        born {person.birth_year ?? "unknown"} · hometown <span lang="ko">{person.hometown ?? "unknown"}</span>
      </p>
      {profile.eras.map((era) => (
        <section className="result-section" key={era.id}>
          <span className="section-label">
            {era.start_year ?? "unknown"}–{era.end_year ?? "unknown"} · age {era.age_range ?? "unknown"}
          </span>
          <strong className="intent">{era.label}</strong>
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
      ))}
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
