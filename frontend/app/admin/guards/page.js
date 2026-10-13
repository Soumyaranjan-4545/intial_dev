"use client";

/**
 * Manage guards (admin only): the admin's one extra power.
 * List guards, add one by email, set their usual office, remove them.
 * Guards can work at every office; "usual office" only records where they
 * normally sit (it's the default office on their forms).
 */

import { useCallback, useEffect, useState } from "react";

import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import styles from "./guards.module.css";

export default function ManageGuardsPage() {
  return (
    <AppShell require="admin">
      <ManageGuards />
    </AppShell>
  );
}

function ManageGuards() {
  const [guards, setGuards] = useState(null);
  const [offices, setOffices] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    apiFetch("/admin/guards").then(setGuards).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
    apiFetch("/offices").then(setOffices).catch(() => setOffices([]));
  }, [load]);

  function done(text) {
    setMessage(text);
    setError("");
    load();
  }

  return (
    <>
      <h1>Manage guards</h1>
      <p className="lede">
        Guards can receive, move and hand over items at every office. Only you can add or remove them.
      </p>

      {message && (
        <div className="success" role="status">
          {message}
        </div>
      )}
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      <AddGuard offices={offices} onAdded={(g) => done(`${g.email} is now a guard.`)} onError={setError} />

      <h2 className={styles.listHeading}>Current guards</h2>
      {!guards && !error && <p className="loading">Loading…</p>}
      {guards && guards.length === 0 && <p>No guards yet. Add one above.</p>}
      {guards && guards.length > 0 && (
        <ul className={styles.list}>
          {guards.map((guard) => (
            <GuardRow
              key={guard.id}
              guard={guard}
              offices={offices}
              onChanged={done}
              onError={setError}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function AddGuard({ offices, onAdded, onError }) {
  const [email, setEmail] = useState("");
  const [officeId, setOfficeId] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const guard = await apiFetch("/admin/guards", {
        method: "POST",
        body: { email: email.trim(), office_id: officeId ? Number(officeId) : null },
      });
      setEmail("");
      setOfficeId("");
      onAdded(guard);
    } catch (err) {
      onError(err.fieldErrors?.email ? "Enter a valid email address." : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={styles.add}>
      <h2>Add a guard</h2>
      <p className="hint">
        They become a guard from their next sign-in. If they&apos;ve never signed in, their account is created now.
      </p>
      <div className={styles.addFields}>
        <div className="field">
          <label htmlFor="guard-email">IITK email</label>
          <input
            id="guard-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@iitk.ac.in"
          />
        </div>
        <div className="field">
          <label htmlFor="guard-office">Usual office (optional)</label>
          <select id="guard-office" value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
            <option value="">None</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="button" disabled={busy || !email.trim()}>
          {busy ? "Adding…" : "Add guard"}
        </button>
      </div>
    </form>
  );
}

function GuardRow({ guard, offices, onChanged, onError }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = guard.full_name || guard.email;

  async function changeOffice(event) {
    const value = event.target.value;
    try {
      await apiFetch(`/admin/guards/${guard.id}`, {
        method: "PATCH",
        body: { office_id: value ? Number(value) : null },
      });
      onChanged(`Updated ${name}'s usual office.`);
    } catch (err) {
      onError(err.message);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await apiFetch(`/admin/guards/${guard.id}`, { method: "DELETE" });
      onChanged(`${name} is no longer a guard.`);
    } catch (err) {
      onError(err.message);
      setBusy(false);
    }
  }

  return (
    <li className={styles.row}>
      <div>
        <strong>{guard.full_name || "Not signed in yet"}</strong>
        <span className={styles.email}>{guard.email}</span>
      </div>
      <div className="field">
        <label htmlFor={`office-${guard.id}`} className="visually-hidden">
          Usual office for {name}
        </label>
        <select id={`office-${guard.id}`} value={guard.office?.id || ""} onChange={changeOffice}>
          <option value="">No usual office</option>
          {offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      {confirming ? (
        <div className={styles.confirm}>
          <span>Remove {name}? They lose guard access immediately.</span>
          <div className="button-row">
            <button type="button" className="button" onClick={remove} disabled={busy}>
              {busy ? "Removing…" : "Remove"}
            </button>
            <button type="button" className="link-button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="button button-secondary" onClick={() => setConfirming(true)}>
          Remove guard
        </button>
      )}
    </li>
  );
}
