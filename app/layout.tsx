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
  metadataBase: new URL('https://booking.glamia.pro'),
  title: "Glamia",
  description: "Réservation en ligne chez votre professionnelle de beauté",
  applicationName: "Glamia",
  openGraph: {
    type: "website",
    siteName: "Glamia",
    title: "Glamia",
    description: "Réservation en ligne chez votre professionnelle de beauté",
    url: "https://booking.glamia.pro",
    locale: "fr_FR",
    images: [
      {
        url: "/og-image.png",
        width: 1024,
        height: 1024,
        alt: "Glamia",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Glamia",
    description: "Réservation en ligne chez votre professionnelle de beauté",
    images: ["/og-image.png"],
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
