/**
 * The root layout wraps every page. Anything here (fonts, global styles,
 * the AuthProvider) applies to the whole site.
 */

import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./globals.css";

import { AuthProvider } from "@/components/AuthProvider";

export const metadata = {
  title: "IITK Lost & Found",
  description: "Report, find and collect lost items through campus security offices.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
