"use client";

/**
 * Staff-only section of an item's page: who reported it, the actions allowed
 * right now (receive, move, dispose or donate) and the custody history.
 *
 * Which actions appear comes from the backend (can_receive, can_transfer,
 * can_dispose); the backend checks them again when an action is sent.
 */

import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/api";
import { EVENT_LABELS, formatDateTime } from "@/lib/labels";
import styles from "./StaffPanel.module.css";

export default function StaffPanel({ item, onChanged }) {
  const [offices, setOffices] = useState([]);

  useEffect(() => {
    apiFetch("/offices").then(setOffices).catch(() => setOffices([]));
  }, []);

  return (
    <section className={styles.panel} aria-labelledby="staff-heading">
      <h2 id="staff-heading">Staff</h2>

      {item.reporter && (
        <p className={styles.reporter}>
          {item.custody_events[0]?.event_type === "REGISTERED" ? "Registered by " : "Reported by "}
          <strong>{item.reporter.full_name}</strong>
          {item.reporter.roll_number ? `, roll number ${item.reporter.roll_number}` : ""} ({item.reporter.email})
        </p>
      )}

      {item.can_receive && <ReceiveForm item={item} offices={offices} onDone={onChanged} />}
      {item.can_transfer && <TransferForm item={item} offices={offices} onDone={onChanged} />}
      {item.can_dispose && <DisposeForm item={item} onDone={onChanged} />}

      <History events={item.custody_events} />
    </section>
  );
}

/** Shared bits for the three action forms. */
function useAction(path, onDone) {
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  async function send(body) {
    setBusy(true);
    setError("");
    setFieldErrors({});
    try {
      onDone(await apiFetch(path, { method: "POST", body }));
      return true;
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.fieldErrors || {});
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { send, error, fieldErrors, busy };
}

function ErrorBox({ message }) {
  return message ? (
    <div className="alert" role="alert">
      {message}
    </div>
  ) : null;
}

function ReceiveForm({ item, offices, onDone }) {
  const { user } = useAuth();
  // Default: the office the finder chose, else the guard's usual office.
  const [officeId, setOfficeId] = useState(String(item.dropoff_office?.id || user.office?.id || ""));
  const [secret, setSecret] = useState(item.secret_detail || "");
  const [condition, setCondition] = useState("");
  const { send, error, fieldErrors, busy } = useAction(`/staff/items/${item.id}/receive`, onDone);

  return (
    <form
      className={styles.action}
      onSubmit={(event) => {
        event.preventDefault();
        send({ office_id: Number(officeId), secret_detail: secret, condition_note: condition });
      }}
    >
      <h3>Receive this item</h3>
      <p className={styles.small}>
        Check the item matches the report above. Once received, it appears on the Found page.
      </p>
      <ErrorBox message={error} />
      <div className="field">
        <label htmlFor="receive-office">Received at</label>
        <select id="receive-office" value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
          {offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="receive-secret">Secret identifying detail</label>
        <span className="hint">
          {item.secret_detail
            ? "Written by the finder. Check it against the item and correct it if needed."
            : "The finder didn't add one. Look at the item and note something not visible in photos."}
        </span>
        <textarea
          id="receive-secret"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          maxLength={300}
          aria-invalid={fieldErrors.secret_detail ? "true" : undefined}
        />
      </div>
      <div className="field">
        <label htmlFor="receive-condition">Condition (optional)</label>
        <input
          id="receive-condition"
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          maxLength={300}
          placeholder="e.g. Screen cracked, zip torn"
        />
      </div>
      <button type="submit" className="button" disabled={busy || !officeId || !secret.trim()}>
        {busy ? "Receiving…" : "Receive item"}
      </button>
    </form>
  );
}

function TransferForm({ item, offices, onDone }) {
  const choices = offices.filter((o) => o.id !== item.current_office?.id);
  const [officeId, setOfficeId] = useState("");
  const [note, setNote] = useState("");
  const { send, error, busy } = useAction(`/staff/items/${item.id}/transfer`, onDone);

  return (
    <form
      className={styles.action}
      onSubmit={async (event) => {
        event.preventDefault();
        if (await send({ to_office_id: Number(officeId), note })) {
          setOfficeId("");
          setNote("");
        }
      }}
    >
      <h3>Move to another office</h3>
      <ErrorBox message={error} />
      <div className="form-row">
        <div className="field">
          <label htmlFor="transfer-office">Move to</label>
          <select id="transfer-office" value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
            <option value="">Choose an office</option>
            {choices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="transfer-note">Note (optional)</label>
          <input id="transfer-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </div>
      </div>
      <button type="submit" className="button button-secondary" disabled={busy || !officeId}>
        {busy ? "Moving…" : "Move item"}
      </button>
    </form>
  );
}

/** Disposing is final, so it asks for a reason and a confirmation. */
function DisposeForm({ item, onDone }) {
  const [outcome, setOutcome] = useState("DONATED");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const { send, error, busy } = useAction(`/staff/items/${item.id}/dispose`, onDone);
  const verb = outcome === "DONATED" ? "Donate" : "Dispose of";

  return (
    <form
      className={styles.action}
      onSubmit={(event) => {
        event.preventDefault();
        if (!confirming) setConfirming(true);
        else send({ outcome, note });
      }}
    >
      <h3>Unclaimed: dispose of or donate</h3>
      <ErrorBox message={error} />
      <fieldset className={styles.choice}>
        <legend className="visually-hidden">Outcome</legend>
        <label>
          <input type="radio" name="outcome" value="DONATED" checked={outcome === "DONATED"}
            onChange={() => { setOutcome("DONATED"); setConfirming(false); }} />
          Donate
        </label>
        <label>
          <input type="radio" name="outcome" value="DISPOSED" checked={outcome === "DISPOSED"}
            onChange={() => { setOutcome("DISPOSED"); setConfirming(false); }} />
          Dispose of
        </label>
      </fieldset>
      <div className="field">
        <label htmlFor="dispose-note">Reason, and where it went</label>
        <input
          id="dispose-note"
          value={note}
          onChange={(e) => { setNote(e.target.value); setConfirming(false); }}
          maxLength={300}
          placeholder="e.g. Unclaimed for 3 months, given to the NSS clothes drive"
        />
      </div>
      {confirming && (
        <p className={styles.warning} role="alert">
          This removes the item from the Found page and can&apos;t be undone. Press again to confirm.
        </p>
      )}
      <div className="button-row">
        <button type="submit" className="button button-secondary" disabled={busy || note.trim().length < 3}>
          {busy ? "Saving…" : confirming ? `Yes, ${verb.toLowerCase()} it` : `${verb} item`}
        </button>
        {confirming && (
          <button type="button" className="link-button" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function History({ events }) {
  if (!events.length) {
    return <p className={styles.small}>No custody history yet: the item hasn&apos;t been handed in.</p>;
  }
  return (
    <>
      <h3>Custody history</h3>
      {/* An ordered list: the history really is a sequence, oldest first. */}
      <ol className={styles.history}>
        {events.map((event) => (
          <li key={event.id}>
            <strong>{EVENT_LABELS[event.event_type]}</strong>
            <span className={styles.small}>
              {event.from_office && ` from ${event.from_office.name}`}
              {event.to_office && ` ${event.from_office ? "to" : "at"} ${event.to_office.name}`}
              {event.actor_name && `, by ${event.actor_name}`}
            </span>
            <span className={styles.when}>{formatDateTime(event.created_at)}</span>
            {event.note && <span className={styles.note}>{event.note}</span>}
          </li>
        ))}
      </ol>
    </>
  );
}
