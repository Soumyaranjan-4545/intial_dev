"use client";

import Link from "next/link";

import AppShell from "@/components/AppShell";
import styles from "./report.module.css";

export default function ReportChooserPage() {
  return (
    <AppShell>
      <h1>Report an item</h1>
      <p className="lede">Did you lose something, or find something that isn't yours?</p>
      <div className={styles.choices}>
        <Link href="/report/lost" className={styles.choice}>
          <strong>I lost something</strong>
          <span>Describe it so finders and security staff can recognise it.</span>
        </Link>
        <Link href="/report/found" className={styles.choice}>
          <strong>I found something</strong>
          <span>Describe it, then hand it in at a campus security office.</span>
        </Link>
      </div>
    </AppShell>
  );
}
