"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import styles from "./SiteHeader.module.css";

const ROLE_NAMES = { STUDENT: "Student", GUARD: "Security guard", ADMIN: "Admin" };

const LINKS = [
  { href: "/found", label: "Found items" },
  { href: "/lost", label: "Lost items" },
  { href: "/my-reports", label: "My reports" },
  { href: "/my-claims", label: "My claims" },
  // Extra links shown only to the roles listed.
  { href: "/staff", label: "Staff desk", roles: ["GUARD", "ADMIN"] },
  { href: "/staff/claims", label: "Claims desk", roles: ["GUARD", "ADMIN"] },
  { href: "/admin/guards", label: "Manage guards", roles: ["ADMIN"] },
];

/** Which link matches the current page? The longest match wins, so on
 * /staff/claims "Claims desk" is marked, not "Staff desk" (/staff). */
function currentLink(pathname, links) {
  const matches = links.filter((link) => pathname === link.href || pathname.startsWith(`${link.href}/`));
  return matches.sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export default function SiteHeader() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
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

  const visible = user ? LINKS.filter((link) => !link.roles || link.roles.includes(user.role)) : [];
  const current = currentLink(pathname, visible);

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
      {user?.is_onboarded && (
        <nav className={styles.nav} aria-label="Main">
          <div className={styles.navInner}>
            {visible.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={styles.navLink}
                // aria-current tells screen readers (and our CSS) which page is open.
                aria-current={link.href === current ? "page" : undefined}
              >
                {link.label}
              </Link>
            ))}
            <Link href="/report" className={`button ${styles.reportButton}`}>
              Report an item
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
