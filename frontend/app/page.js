"use client";

/**
 * Home page for signed-in users. For now it confirms who you are and what
 * your role lets you do; the item pages are added in Phase 3.
 */

import { useAuth, useRequireUser } from "@/components/AuthProvider";
import SiteHeader from "@/components/SiteHeader";
import styles from "./home.module.css";

const ROLE_SUMMARY = {
  STUDENT: "Report items you've lost or found, and claim items held at a security office.",
  GUARD: "Receive found items, review ownership claims and hand items back at any security office.",
  ADMIN: "Everything a guard can do, plus assigning and removing guards.",
};

export default function HomePage() {
  const { error } = useAuth();
  const user = useRequireUser();

  if (error) {
    return (
      <main className="page">
        <div className="alert" role="alert">
          {error}
        </div>
      </main>
    );
  }
  if (!user) return <p className="loading">Loading…</p>;

  const firstName = user.full_name.split(" ")[0];
  const isStaff = user.role !== "STUDENT";

  return (
    <>
      <SiteHeader />
      <main className="page">
        <h1>Hello, {firstName}</h1>
        <p className="lede">{ROLE_SUMMARY[user.role]}</p>

        <section className={styles.section} aria-labelledby="profile-heading">
          <h2 id="profile-heading">Your profile</h2>
          <dl className={styles.details}>
            <dt>Name</dt>
            <dd>{user.full_name}</dd>
            <dt>Email</dt>
            <dd>{user.email}</dd>
            {!isStaff && (
              <>
                <dt>Roll number</dt>
                <dd>{user.roll_number}</dd>
              </>
            )}
            <dt>Mobile</dt>
            <dd>{user.phone || "Not added"}</dd>
            {!isStaff && (
              <>
                <dt>Hall and room</dt>
                <dd>{[user.hall, user.room].filter(Boolean).join(", ") || "Not added"}</dd>
              </>
            )}
            {isStaff && (
              <>
                <dt>Usual office</dt>
                <dd>{user.office?.name || "Not assigned"}</dd>
              </>
            )}
          </dl>
        </section>

        <div className="notice">
          Found and lost item pages are coming next. Until then, nothing else is needed from you.
        </div>
      </main>
    </>
  );
}
