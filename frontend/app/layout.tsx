import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import type { ReactNode } from "react";

import "@/app/globals.css";
import { AppShell } from "@/components/AppShell";
import { AppProviders } from "@/components/AppProviders";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body"
});

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display"
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Kian Falcon Workflow Tracker",
  description: "Internal workflow tracker for stage-based project visibility.",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/kian-falcon-icon.png", type: "image/png", sizes: "512x512" }
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"]
  },
  openGraph: {
    title: "Kian Falcon Workflow Tracker",
    description: "Shared project visibility across Sales, R&D, Production, Procurement, QC, and Dispatch.",
    type: "website",
    siteName: "Kian Falcon Workflow Tracker",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Kian Falcon Workflow Tracker social preview"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Kian Falcon Workflow Tracker",
    description: "Shared project visibility across Sales, R&D, Production, Procurement, QC, and Dispatch.",
    images: ["/twitter-image.png"]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${manrope.variable} font-sans antialiased`}>
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
