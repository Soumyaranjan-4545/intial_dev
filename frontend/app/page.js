"use client";

/** Home page for signed-in users: the main actions, and their profile. */

import Link from "next/link";

import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import reportStyles from "./report/report.module.css";
import styles from "./home.module.css";

const ROLE_SUMMARY = {
  STUDENT: "Report items you've lost or found, and look through items held at the security offices.",
  GUARD: "Receive found items, review ownership claims and hand items back at any security office.",
  ADMIN: "Everything a guard can do, plus assigning and removing guards.",
};

export default function HomePage() {
  return (
    <AppShell>
      <Home />
    </AppShell>
  );
}

function Home() {
  const { user } = useAuth();
  const firstName = user.full_name.split(" ")[0];
  const isStaff = user.role !== "STUDENT";

  return (
    <>
      <h1>Hello, {firstName}</h1>
      <p className="lede">{ROLE_SUMMARY[user.role]}</p>

      <div className={reportStyles.choices}>
        <Link href="/report/lost" className={reportStyles.choice}>
          <strong>I lost something</strong>
          <span>Report it, and check whether it has already been handed in.</span>
        </Link>
        <Link href="/report/found" className={reportStyles.choice}>
          <strong>I found something</strong>
          <span>Describe it, then hand it in at a security office.</span>
        </Link>
        <Link href="/found" className={reportStyles.choice}>
          <strong>Browse found items</strong>
          <span>Everything currently held at the security offices.</span>
        </Link>
      </div>

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
    </>
  );
}
