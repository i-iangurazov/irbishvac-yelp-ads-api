import type { Metadata } from "next";

import "@/app/globals.css";

import { Providers } from "@/components/layout/providers";

export const metadata: Metadata = {
  title: "Yelp Operations Console",
  description: "Internal admin platform for Yelp Ads, lead operations, reporting, and CRM enrichment workflows."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
