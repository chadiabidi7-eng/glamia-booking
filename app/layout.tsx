import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Glamia — Réservation en ligne",
  description: "Prenez rendez-vous chez votre professionnelle de beauté en quelques clics.",
  applicationName: "Glamia",
  openGraph: {
    type: "website",
    siteName: "Glamia",
    title: "Glamia — Réservation en ligne",
    description: "Prenez rendez-vous chez votre professionnelle de beauté en quelques clics.",
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Glamia — Réservation en ligne",
    description: "Prenez rendez-vous chez votre professionnelle de beauté en quelques clics.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
