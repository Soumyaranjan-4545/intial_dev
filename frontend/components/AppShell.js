"use client";

/**
 * The frame for every signed-in page: checks the user may be here
 * (signed in and onboarded), then shows the header and the page content.
 *
 *   <AppShell wide>...</AppShell>   wide = more room, for item grids
 */

import { useAuth, useRequireUser } from "@/components/AuthProvider";
import SiteHeader from "@/components/SiteHeader";

export default function AppShell({ children, wide = false }) {
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

  return (
    <>
      <SiteHeader />
      <main className={wide ? "page page-wide" : "page"}>{children}</main>
    </>
  );
}
