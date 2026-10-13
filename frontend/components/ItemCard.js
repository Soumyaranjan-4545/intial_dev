/**
 * One item in a grid (Found page, Lost page, My reports).
 * The whole card links to the item's page.
 */

import Link from "next/link";

import { photoUrl } from "@/lib/api";
import { FINISHED_STATUSES, STATUS_LABELS, formatDate } from "@/lib/labels";
import styles from "./ItemCard.module.css";

// fadeFinished: grey out returned/closed items (useful in My reports, where
// they're mixed with open ones; not on the Returned page, where all are).
export default function ItemCard({ item, showStatus = false, extraAction = null, fadeFinished = true }) {
  const isFound = item.kind === "FOUND";
  const finished = fadeFinished && FINISHED_STATUSES.includes(item.status);

  return (
    <article className={`${styles.card} ${finished ? styles.finished : ""}`}>
      <Link href={`/items/${item.id}`} className={styles.link}>
        <div className={styles.photo}>
          {item.cover_photo_id ? (
            // A plain <img>: photos come from our own API, which checks permissions.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl(item.id, item.cover_photo_id)} alt="" loading="lazy" />
          ) : (
            <span className={styles.noPhoto}>{item.category.name}</span>
          )}
        </div>
        <div className={styles.body}>
          {showStatus && <span className={styles.status}>{STATUS_LABELS[item.status]}</span>}
          <h3 className={styles.title}>{item.title}</h3>
          <p className={styles.meta}>
            {isFound ? "Found" : "Lost"} at {item.location_text}
            <br />
            on {formatDate(item.happened_on)}
          </p>
          {isFound && item.current_office && <p className={styles.office}>Held at {item.current_office.name}</p>}
        </div>
      </Link>
      {extraAction && <div className={styles.action}>{extraAction}</div>}
    </article>
  );
}
