"use client";

/**
 * The report form, shared by "Report a lost item" and "Hand in a found item".
 * kind="LOST" or kind="FOUND"; found reports also ask for the drop-off
 * office and the optional secret detail.
 *
 * Submitting happens in two steps:
 *   1. POST /items/lost or /items/found with the text fields (JSON)
 *   2. POST /items/{id}/photos once per photo (file upload)
 * Then we open the new item's page.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { apiFetch, apiUpload } from "@/lib/api";
import { todayIso } from "@/lib/labels";
import styles from "./ReportForm.module.css";

const MAX_PHOTOS = 3;
const MAX_PHOTO_MB = 5;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

const EMPTY = {
  title: "",
  category_id: "",
  description: "",
  colour: "",
  brand: "",
  location_text: "",
  happened_on: "",
  dropoff_office_id: "",
  secret_detail: "",
};

export default function ReportForm({ kind }) {
  const router = useRouter();
  const params = useSearchParams();
  const isFound = kind === "FOUND";
  // "I found this" on the Lost page links here with ?for=<lost item id>.
  const forLostId = isFound ? params.get("for") : null;

  const [form, setForm] = useState(EMPTY);
  const [photos, setPhotos] = useState([]); // [{ file, preview }]
  const [categories, setCategories] = useState([]);
  const [offices, setOffices] = useState([]);
  const [lostItem, setLostItem] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch("/categories").then(setCategories).catch(() => setError("Couldn't load the category list."));
    if (isFound) apiFetch("/offices").then(setOffices).catch(() => setError("Couldn't load the office list."));
  }, [isFound]);

  // Prefill from the lost report this finder is responding to.
  useEffect(() => {
    if (!forLostId) return;
    apiFetch(`/items/${forLostId}`)
      .then((item) => {
        setLostItem(item);
        setForm((current) => ({
          ...current,
          title: item.title,
          category_id: String(item.category.id),
          colour: item.colour || "",
          brand: item.brand || "",
        }));
      })
      .catch(() => setLostItem(null));
  }, [forLostId]);

  // Previews are temporary in-memory addresses (blob: URLs). Free them when
  // the page closes; removePhoto frees each one as it's removed.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => {
    return () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview));
  }, []);

  function update(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
  }

  function addPhotos(event) {
    const chosen = [...event.target.files];
    event.target.value = ""; // allow choosing the same file again later
    const problems = [];
    const accepted = [];
    for (const file of chosen) {
      if (!PHOTO_TYPES.includes(file.type)) problems.push(`${file.name}: use a JPEG, PNG or WebP photo.`);
      else if (file.size > MAX_PHOTO_MB * 1024 * 1024) problems.push(`${file.name}: larger than ${MAX_PHOTO_MB} MB.`);
      else accepted.push({ file, preview: URL.createObjectURL(file) });
    }
    const room = MAX_PHOTOS - photos.length;
    if (accepted.length > room) problems.push(`You can add up to ${MAX_PHOTOS} photos.`);
    setPhotos((current) => [...current, ...accepted.slice(0, room)]);
    setFieldErrors((current) => ({ ...current, photos: problems.join(" ") || undefined }));
  }

  function removePhoto(index) {
    URL.revokeObjectURL(photos[index].preview);
    setPhotos((current) => current.filter((_, i) => i !== index));
  }

  /** Quick checks before sending, so common mistakes get instant messages.
   * The backend checks everything again: it never trusts the browser. */
  function checkForm() {
    const problems = {};
    if (form.title.trim().length < 3) problems.title = "Give it a short name, at least 3 characters.";
    if (!form.category_id) problems.category_id = "Choose a category.";
    if (form.description.trim().length < 10) problems.description = "Describe it in at least 10 characters.";
    if (form.location_text.trim().length < 3) problems.location_text = "Say where, at least 3 characters.";
    if (!form.happened_on) problems.happened_on = "Choose the date.";
    if (isFound && !form.dropoff_office_id) problems.dropoff_office_id = "Choose where you'll hand it in.";
    return problems;
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    const problems = checkForm();
    setFieldErrors(problems);
    if (Object.keys(problems).length) {
      setError("Please check the highlighted fields.");
      return;
    }

    setBusy(true);
    const body = {
      title: form.title,
      category_id: Number(form.category_id),
      description: form.description,
      colour: form.colour,
      brand: form.brand,
      location_text: form.location_text,
      happened_on: form.happened_on,
    };
    if (isFound) {
      body.dropoff_office_id = Number(form.dropoff_office_id);
      body.secret_detail = form.secret_detail;
    }

    let item;
    try {
      item = await apiFetch(isFound ? "/items/found" : "/items/lost", { method: "POST", body });
    } catch (err) {
      setFieldErrors(err.fieldErrors || {});
      setError(err.message);
      setBusy(false);
      return;
    }

    // The report is saved; now the photos. A failed photo doesn't undo the report.
    let failed = 0;
    for (const photo of photos) {
      try {
        await apiUpload(`/items/${item.id}/photos`, photo.file);
      } catch {
        failed += 1;
      }
    }
    router.push(`/items/${item.id}?new=1${failed ? `&photos_failed=${failed}` : ""}`);
  }

  function errorProps(name) {
    return fieldErrors[name]
      ? { "aria-invalid": "true", "aria-describedby": `${name}-error` }
      : {};
  }

  function errorText(name) {
    return fieldErrors[name] ? (
      <span className="field-error" id={`${name}-error`}>
        {fieldErrors[name]}
      </span>
    ) : null;
  }

  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      {lostItem && (
        <div className="notice">
          You're handing in something that matches <strong>{lostItem.title}</strong> ({lostItem.ref}). We've
          copied its details; change anything that's different.
        </div>
      )}

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      <fieldset className={styles.group}>
        <legend>What is it?</legend>
        <div className="field">
          <label htmlFor="title">Item name</label>
          <span className="hint">A few words, e.g. "Blue steel water bottle".</span>
          <input id="title" name="title" value={form.title} onChange={update} maxLength={120} {...errorProps("title")} />
          {errorText("title")}
        </div>

        <div className="field">
          <label htmlFor="category_id">Category</label>
          <select id="category_id" name="category_id" value={form.category_id} onChange={update} {...errorProps("category_id")}>
            <option value="">Choose a category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {errorText("category_id")}
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="colour">Colour (optional)</label>
            <input id="colour" name="colour" value={form.colour} onChange={update} maxLength={40} />
          </div>
          <div className="field">
            <label htmlFor="brand">Brand (optional)</label>
            <input id="brand" name="brand" value={form.brand} onChange={update} maxLength={60} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="description">Description</label>
          <span className="hint">
            {isFound
              ? "What anyone can see from looking at it. Keep identifying details for the secret detail below."
              : "Anything that helps someone recognise it: size, stickers, case, what was inside."}
          </span>
          <textarea id="description" name="description" value={form.description} onChange={update} maxLength={1000} {...errorProps("description")} />
          {errorText("description")}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>{isFound ? "Where and when did you find it?" : "Where and when did you lose it?"}</legend>
        <div className="field">
          <label htmlFor="location_text">Place</label>
          <span className="hint">As exact as you can, e.g. "Library, 2nd floor reading room".</span>
          <input id="location_text" name="location_text" value={form.location_text} onChange={update} maxLength={200} {...errorProps("location_text")} />
          {errorText("location_text")}
        </div>
        <div className="field">
          <label htmlFor="happened_on">Date</label>
          <input id="happened_on" name="happened_on" type="date" max={todayIso()} value={form.happened_on} onChange={update} {...errorProps("happened_on")} />
          {errorText("happened_on")}
        </div>
      </fieldset>

      {isFound && (
        <fieldset className={styles.group} aria-describedby="office-hint">
          <legend>Where will you hand it in?</legend>
          <p className="hint" id="office-hint">
            Take the item to this office. It appears on the Found page once a guard receives it.
          </p>
          <div className={styles.offices}>
            {offices.map((office) => (
              <label key={office.id} className={styles.office}>
                <input
                  type="radio"
                  name="dropoff_office_id"
                  value={office.id}
                  checked={form.dropoff_office_id === String(office.id)}
                  onChange={update}
                />
                <span>
                  <strong>{office.name}</strong>
                  <span className={styles.officeInfo}>{office.location_description}</span>
                  <span className={styles.officeInfo}>Open: {office.opening_hours}</span>
                </span>
              </label>
            ))}
          </div>
          {fieldErrors.dropoff_office_id && <span className="field-error">{fieldErrors.dropoff_office_id}</span>}
        </fieldset>
      )}

      {isFound && (
        <fieldset className={styles.group}>
          <legend>Secret identifying detail (optional)</legend>
          <div className="field">
            <label htmlFor="secret_detail">Something only the real owner would know</label>
            <span className="hint">
              Not visible in photos: a sticker underneath, the lock-screen picture, what's inside. Only security
              staff see this; they use it to check who the item really belongs to. If you leave it empty, the
              guard will add one when you hand it in.
            </span>
            <textarea id="secret_detail" name="secret_detail" value={form.secret_detail} onChange={update} maxLength={300} {...errorProps("secret_detail")} />
            {errorText("secret_detail")}
          </div>
        </fieldset>
      )}

      <fieldset className={styles.group}>
        <legend>Photos (optional, up to {MAX_PHOTOS})</legend>
        {photos.length > 0 && (
          <ul className={styles.previews}>
            {photos.map((photo, index) => (
              <li key={photo.preview}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.preview} alt={`Photo ${index + 1}`} />
                <button type="button" className="link-button" onClick={() => removePhoto(index)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {photos.length < MAX_PHOTOS && (
          <div className="field">
            <label htmlFor="photos" className={styles.fileLabel}>
              Add photos
            </label>
            <span className="hint">JPEG, PNG or WebP, up to {MAX_PHOTO_MB} MB each.</span>
            <input id="photos" type="file" accept={PHOTO_TYPES.join(",")} multiple onChange={addPhotos} />
          </div>
        )}
        {fieldErrors.photos && <span className="field-error">{fieldErrors.photos}</span>}
      </fieldset>

      <button type="submit" className="button" disabled={busy}>
        {busy ? "Submitting…" : isFound ? "Submit found item" : "Submit lost item"}
      </button>
    </form>
  );
}
