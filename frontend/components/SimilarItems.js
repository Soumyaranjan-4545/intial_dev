"use client";

/**
 * "Similar items found" on an item's page.
 *
 * A lost report shows found items that might be it; a found item shows lost
 * reports that might be its owner's. Shown to the person who reported the
 * item, and staff (the backend says so with item.can_see_similar).
 *
 * The suggestions come from GET /items/{id}/similar. This component doesn't
 * know or care HOW they're chosen: that's the matcher on the backend
 * (backend/app/services/matching.py), which a teammate is building.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiFetch, photoUrl } from "@/lib/api";
import { formatDate } from "@/lib/labels";
import listStyles from "@/app/staff/staff.module.css";
import styles from "./SimilarItems.module.css";

/** Words instead of a raw number: "0.83" means little to a student. */
function strength(score) {
  if (score >= 0.75) return "Strong match";
  if (score >= 0.45) return "Possible match";
  return "Weak match";
}

export default function SimilarItems({ item }) {
  const [result, setResult] = useState(null);

  useEffect(() => {
    apiFetch(`/items/${item.id}/similar`)
      .then(setResult)
      .catch(() => setResult(null)); // on failure the section stays hidden
  }, [item.id]);

  const isLost = item.kind === "LOST";

  // Show nothing until we know matching is switched on: while it's off (the
  // placeholder matcher), or if loading fails, the section is hidden.
  if (!result || !result.enabled) return null;

  let body;
  if (result.matches.length === 0) {
    body = (
      <p className={styles.muted}>
        Nothing similar yet. New {isLost ? "found items" : "lost reports"} are checked as they come in, so look again
        later.
      </p>
    );
  } else {
    body = (
      <>
        <p className={styles.muted}>
          {isLost
            ? "These found items look like yours. If one is, open it and press “This is mine”."
            : "These lost reports might belong to the owner."}
        </p>
        {/* Compact rows, not big cards: this sits inside a narrow item page. */}
        <ul className={listStyles.list}>
          {result.matches.map(({ item: other, score, reason }) => (
            <li key={other.id} className={listStyles.row}>
              <div className={listStyles.thumb}>
                {other.cover_photo_id ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl(other.id, other.cover_photo_id)} alt="" loading="lazy" />
                ) : (
                  <span>{other.category.name}</span>
                )}
              </div>
              <div>
                <Link href={`/items/${other.id}`} className={listStyles.title}>
                  {other.title}
                </Link>
                <p className={listStyles.meta}>
                  {other.kind === "FOUND" ? "Found" : "Lost"} at {other.location_text} on{" "}
                  {formatDate(other.happened_on)}
                  {other.current_office ? `. Held at ${other.current_office.name}` : ""}.
                </p>
                <p className={styles.match}>
                  <strong>{strength(score)}</strong>
                  {reason && `: ${reason}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <section className={styles.section} aria-labelledby="similar-heading">
      <h2 id="similar-heading">Similar items found</h2>
      {body}
    </section>
  );
}
