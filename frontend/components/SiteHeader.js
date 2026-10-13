"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import styles from "./SiteHeader.module.css";

const ROLE_NAMES = { STUDENT: "Student", GUARD: "Security guard", ADMIN: "Admin" };

export default function SiteHeader() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/login");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          IITK Lost &amp; Found
        </Link>
        {user && (
          <div className={styles.account}>
            <span className={styles.who}>
              {user.full_name || user.email}
              <span className={styles.role}>{ROLE_NAMES[user.role]}</span>
            </span>
            <button type="button" className="link-button" onClick={handleSignOut} disabled={signingOut}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
