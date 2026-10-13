"use client";

/**
 * Sign-in page, in two steps on the same page:
 *   step "email": enter your @iitk.ac.in address -> POST /auth/request-code
 *   step "code":  enter the 6-digit code         -> POST /auth/verify-code
 * After a correct code, the backend sets the session cookie, and we send
 * the user to onboarding (first time) or the home page.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/api";
import styles from "./login.module.css";

const DOMAIN = "iitk.ac.in";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, setUser } = useAuth();

  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [expiresIn, setExpiresIn] = useState(10);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Already signed in? Skip this page.
  useEffect(() => {
    if (!loading && user) router.replace(user.is_onboarded ? "/" : "/onboarding");
  }, [user, loading, router]);

  async function requestCode(event) {
    event?.preventDefault(); // stop the browser reloading the page on submit
    setError("");
    setBusy(true);
    try {
      const result = await apiFetch("/auth/request-code", {
        method: "POST",
        body: { email: email.trim() },
      });
      setExpiresIn(result.expires_in_minutes);
      setCode("");
      setStep("code");
    } catch (err) {
      setError(err.fieldErrors?.email ? "Enter a valid email address." : err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const signedIn = await apiFetch("/auth/verify-code", {
        method: "POST",
        body: { email: email.trim(), code },
      });
      setUser(signedIn); // the redirect effect above takes it from here
    } catch (err) {
      setError(err.fieldErrors?.code ? "Enter the 6 digits from the email." : err.message);
      setBusy(false);
    }
  }

  function changeEmail() {
    setStep("email");
    setError("");
  }

  return (
    <main className={styles.page}>
      <div className={styles.tag}>
        <svg className={styles.string} viewBox="0 0 112 84" aria-hidden="true">
          <path
            d="M56 82 C 20 60, 6 30, 30 10 S 96 6, 84 34 S 62 70, 56 82"
            fill="none"
            stroke="var(--string)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
        <span className={styles.hole} aria-hidden="true" />

        <div className={styles.card}>
          {step === "email" ? (
            <form onSubmit={requestCode} noValidate>
              <h1 className={styles.heading}>Sign in</h1>
              <p className={styles.lede}>
                Lost or found something on campus? Sign in with your IITK email and we'll send you a
                one-time code.
              </p>

              {error && (
                <div className="alert" role="alert">
                  {error}
                </div>
              )}

              <div className="field">
                <label htmlFor="email">Email address</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder={`yourid@${DOMAIN}`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <button type="submit" className="button button-full" disabled={busy || !email.trim()}>
                {busy ? "Sending code…" : "Send code"}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyCode} noValidate>
              <h1 className={styles.heading}>Enter your code</h1>
              <p className={styles.lede}>
                We sent a 6-digit code to <strong>{email.trim().toLowerCase()}</strong>. It works once
                and expires in {expiresIn} minutes.
              </p>

              {error && (
                <div className="alert" role="alert">
                  {error}
                </div>
              )}

              <div className="field">
                <label htmlFor="code">6-digit code</label>
                <input
                  id="code"
                  className={styles.code}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  // Keep only digits, so pasting "482 913" still works.
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoFocus
                />
              </div>
              <button type="submit" className="button button-full" disabled={busy || code.length !== 6}>
                {busy ? "Checking…" : "Sign in"}
              </button>

              <div className={styles.actions}>
                <button type="button" className="link-button" onClick={changeEmail}>
                  Use a different email
                </button>
                <button type="button" className="link-button" onClick={() => requestCode()} disabled={busy}>
                  Send a new code
                </button>
              </div>

              {process.env.NODE_ENV === "development" && (
                <p className={styles.devHint}>
                  Development mode: the code is printed in the terminal running the backend.
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
