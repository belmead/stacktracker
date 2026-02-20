import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ComplianceGate } from "@/components/compliance-gate";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"]
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"]
});

export const metadata: Metadata = {
  title: "Stack Tracker",
  description: "Peptide pricing intelligence with normalized unit comparisons."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ComplianceGate />
        {children}
      </body>
    </html>
  );
}
