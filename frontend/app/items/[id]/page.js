"use client";

/**
 * One item's page. What's shown depends on who's looking; the backend
 * decides, and sends flags like can_close and can_edit_secret.
 */

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import StaffPanel from "@/components/StaffPanel";
import { apiFetch, apiUpload, photoUrl } from "@/lib/api";
import { CLAIM_STATUS_LABELS, OPEN_CLAIM_STATUSES, STATUS_LABELS, formatDate, formatDateTime } from "@/lib/labels";
import styles from "./item.module.css";

// Statuses shown on the public Found and Lost pages.
const PUBLIC = ["IN_CUSTODY", "CLAIM_PENDING", "OPEN"];

export default function ItemPage() {
  return (
    <AppShell>
      <Suspense fallback={<p className="loading">Loading…</p>}>
        <ItemDetail />
      </Suspense>
    </AppShell>
  );
}

function ItemDetail() {
  const { id } = useParams(); // from the address: /items/<id>
  const params = useSearchParams();
  const { user } = useAuth();
  const [item, setItem] = useState(null);
  const [error, setError] = useState("");
  const [shownPhoto, setShownPhoto] = useState(0);

  const load = useCallback(() => {
    apiFetch(`/items/${id}`)
      .then((data) => {
        setItem(data);
        setError("");
      })
      .catch((err) => setError(err.status === 404 ? "This item doesn't exist, or you can't see it." : err.message));
  }, [id]);

  useEffect(load, [load]);

  if (error) {
    return (
      <>
        <div className="alert" role="alert">
          {error}
        </div>
        <Link href="/found">Back to found items</Link>
      </>
    );
  }
  if (!item) return <p className="loading">Loading…</p>;

  const isFound = item.kind === "FOUND";
  const isStaff = user.role !== "STUDENT";
  const photosFailed = Number(params.get("photos_failed")) || 0;

  return (
    <article>
      {params.get("new") && (
        <div className="success" role="status">
          {!isFound
            ? "Your lost item report is saved."
            : item.status === "IN_CUSTODY"
              ? "Item registered. It's on the Found page now."
              : "Thanks for reporting it."}
          {photosFailed > 0 && ` ${photosFailed} photo(s) couldn't be uploaded; you can add them below.`}
        </div>
      )}

      <p className={styles.back}>
        {/* Items not on the public pages (e.g. waiting to be handed in) link back to My reports. */}
        {item.is_mine && !PUBLIC.includes(item.status) ? (
          <Link href="/my-reports">My reports</Link>
        ) : (
          <Link href={isFound ? "/found" : "/lost"}>{isFound ? "Found items" : "Lost items"}</Link>
        )}
      </p>

      <header className={styles.header}>
        <h1>{item.title}</h1>
        <p className={styles.ref}>
          {item.ref}, {STATUS_LABELS[item.status].toLowerCase()}
        </p>
      </header>

      {item.photo_ids.length > 0 && (
        <div className={styles.gallery}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.mainPhoto}
            src={photoUrl(item.id, item.photo_ids[shownPhoto] ?? item.photo_ids[0])}
            alt={`Photo of ${item.title}`}
          />
          {item.photo_ids.length > 1 && (
            <div className={styles.thumbs}>
              {item.photo_ids.map((photoId, index) => (
                <button
                  key={photoId}
                  type="button"
                  className={styles.thumb}
                  aria-label={`Show photo ${index + 1}`}
                  aria-pressed={index === shownPhoto}
                  onClick={() => setShownPhoto(index)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl(item.id, photoId)} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* What happens next: only for the finder, before hand-in. */}
      {isFound && item.status === "AWAITING_DROPOFF" && item.is_mine && item.dropoff_office && (
        <section className={styles.nextStep} aria-labelledby="next-step">
          <h2 id="next-step">Next: hand it in</h2>
          <p>
            Take the item to <strong>{item.dropoff_office.name}</strong>. {item.dropoff_office.location_description}.
            Open {item.dropoff_office.opening_hours}.
          </p>
          <p>Only you can see this report until a guard receives the item. Then it appears on the Found page.</p>
        </section>
      )}

      {isFound && item.current_office_full && (
        <section className={styles.office} aria-labelledby="where-held">
          <h2 id="where-held">Where it's held</h2>
          <p>
            <strong>{item.current_office_full.name}</strong>
            <br />
            {item.current_office_full.location_description}
            <br />
            Open {item.current_office_full.opening_hours}
          </p>
        </section>
      )}

      {isFound && <ClaimBox item={item} />}

      {item.returned_at && (
        <p className="success" role="status">
          Returned to its owner on {formatDateTime(item.returned_at)}.
        </p>
      )}

      <dl className={styles.facts}>
        <dt>Category</dt>
        <dd>{item.category.name}</dd>
        {item.colour && (
          <>
            <dt>Colour</dt>
            <dd>{item.colour}</dd>
          </>
        )}
        {item.brand && (
          <>
            <dt>Brand</dt>
            <dd>{item.brand}</dd>
          </>
        )}
        <dt>{isFound ? "Found at" : "Lost at"}</dt>
        <dd>{item.location_text}</dd>
        <dt>{isFound ? "Found on" : "Lost on"}</dt>
        <dd>{formatDate(item.happened_on)}</dd>
      </dl>

      <h2>Description</h2>
      <p className={styles.description}>{item.description}</p>

      {/* While receiving, the secret is checked in the Receive form instead. */}
      {(item.can_edit_secret || (isStaff && isFound)) && !item.can_receive && (
        <SecretDetail item={item} onSaved={setItem} />
      )}

      {isStaff && isFound && item.claims.length > 0 && <ItemClaims claims={item.claims} />}

      {isStaff && isFound && <StaffPanel item={item} onChanged={setItem} />}

      {item.can_add_photos && <AddPhoto itemId={item.id} onAdded={setItem} />}

      {item.can_close && <CloseLost item={item} onClosed={setItem} />}

      {!isFound && !item.is_mine && item.status === "OPEN" && (
        <section className={styles.panel}>
          <h2>Found it?</h2>
          <p>Hand it in at a security office and tell us what you found.</p>
          <Link href={`/report/found?for=${item.id}`} className="button">
            I found this
          </Link>
        </section>
      )}
    </article>
  );
}

/** "This is mine", or a link to my claim if I already made one. */
function ClaimBox({ item }) {
  const mine = item.my_claim;
  const mineIsOpen = mine && OPEN_CLAIM_STATUSES.includes(mine.status);

  if (mineIsOpen) {
    return (
      <section className={styles.nextStep} aria-labelledby="claim-heading">
        <h2 id="claim-heading">Your claim</h2>
        <p>
          <Link href={`/claims/${mine.id}`}>{mine.ref}</Link>: {CLAIM_STATUS_LABELS[mine.status].toLowerCase()}.
        </p>
      </section>
    );
  }
  if (!item.can_claim) return null;
  return (
    <section className={styles.panel} aria-labelledby="claim-heading">
      <h2 id="claim-heading">Is this yours?</h2>
      <p>
        Tell a security guard something only the owner would know. If they agree it's yours, you collect it from the
        office with your student ID card.
        {mine && (
          <>
            {" "}
            Your earlier claim <Link href={`/claims/${mine.id}`}>{mine.ref}</Link> was{" "}
            {CLAIM_STATUS_LABELS[mine.status].toLowerCase()}.
          </>
        )}
      </p>
      <p>
        <Link href={`/items/${item.id}/claim`} className="button">
          This is mine
        </Link>
      </p>
    </section>
  );
}

/** For staff: every claim on this item. */
function ItemClaims({ claims }) {
  return (
    <section className={styles.panel} aria-labelledby="claims-heading">
      <h2 id="claims-heading">Claims on this item</h2>
      <ul>
        {claims.map((claim) => (
          <li key={claim.id}>
            <Link href={`/claims/${claim.id}`}>{claim.ref}</Link> by {claim.claimant_name},{" "}
            {CLAIM_STATUS_LABELS[claim.status].toLowerCase()} (sent {formatDateTime(claim.created_at)})
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The secret identifying detail: editable by the finder before hand-in,
 * visible to security staff. Everyone else never receives it from the API. */
function SecretDetail({ item, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.secret_detail || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const updated = await apiFetch(`/items/${item.id}/secret-detail`, {
        method: "PUT",
        body: { secret_detail: text },
      });
      onSaved(updated);
      setEditing(false);
    } catch (err) {
      setError(err.fieldErrors?.secret_detail || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.secret} aria-labelledby="secret-heading">
      <h2 id="secret-heading">Secret identifying detail</h2>
      <p className={styles.small}>
        Only security staff{item.is_mine && item.status === "AWAITING_DROPOFF" ? " and you (until you hand it in)" : ""} can see this. It's
        used to check who the item really belongs to.
      </p>
      {editing ? (
        <form onSubmit={save}>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          <div className="field">
            <label htmlFor="secret">Secret detail</label>
            <textarea id="secret" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} />
          </div>
          <div className="button-row">
            <button type="submit" className="button" disabled={busy}>
              {busy ? "Saving…" : "Save secret detail"}
            </button>
            <button type="button" className="link-button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <p>{item.secret_detail || "None recorded yet. The guard will add one when it's handed in."}</p>
          {item.secret_detail_by && (
            <p className={styles.small}>Recorded by the {item.secret_detail_by === "GUARD" ? "guard" : "finder"}.</p>
          )}
          {item.can_edit_secret && (
            <button type="button" className="button button-secondary" onClick={() => setEditing(true)}>
              {item.secret_detail ? "Change secret detail" : "Add secret detail"}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function AddPhoto({ itemId, onAdded }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      onAdded(await apiUpload(`/items/${itemId}/photos`, file));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel}>
      <div className="field">
        <label htmlFor="add-photo">Add a photo</label>
        <span className="hint">JPEG, PNG or WebP, up to 5 MB.</span>
        <input id="add-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={busy} />
        {busy && <span className="hint">Uploading…</span>}
        {error && <span className="field-error">{error}</span>}
      </div>
    </section>
  );
}

/** Closing a lost report asks for confirmation first, because it removes the
 * report from the Lost page and can't be undone. */
function CloseLost({ item, onClosed }) {
  const [choice, setChoice] = useState(null); // "RECOVERED" | "CLOSED" | null
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      onClosed(await apiFetch(`/items/${item.id}/close`, { method: "POST", body: { outcome: choice } }));
      setChoice(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="close-heading">
      <h2 id="close-heading">Close this report</h2>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {choice ? (
        <>
          <p>
            {choice === "RECOVERED" ? "Glad you got it back. " : ""}This removes the report from the Lost page, and it
            can't be reopened.
          </p>
          <div className="button-row">
            <button type="button" className="button" onClick={confirm} disabled={busy}>
              {busy ? "Closing…" : "Close report"}
            </button>
            <button type="button" className="link-button" onClick={() => setChoice(null)}>
              Keep it open
            </button>
          </div>
        </>
      ) : (
        <div className="button-row">
          <button type="button" className="button button-secondary" onClick={() => setChoice("RECOVERED")}>
            I got it back
          </button>
          <button type="button" className="button button-secondary" onClick={() => setChoice("CLOSED")}>
            I've stopped looking
          </button>
        </div>
      )}
    </section>
  );
}
