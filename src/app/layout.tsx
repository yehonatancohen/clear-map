import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#030712",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://clearmap.co.il"),
  title: "מפה שקופה | Clear Map",
  description: "מערכת מודיעין ויזואלית בזמן אמת — התרעות פיקוד העורף ומודיעין טלגרם",
  keywords: ["צבע אדום", "מפה", "מודיעין", "התרעות", "פיקוד העורף", "כטבם", "טלגרם", "ישראל", "clear map"],
  openGraph: {
    title: "מפה שקופה | Clear Map",
    description: "מערכת מודיעין ויזואלית בזמן אמת — התרעות פיקוד העורף ומודיעין טלגרם",
    url: "https://clearmap.co.il",
    siteName: "מפה שקופה",
    locale: "he_IL",
    type: "website",
    images: [
      {
        url: "/og-image-wa.jpg",
        width: 600,
        height: 600,
        alt: "מפה שקופה בזמן אמת",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "מפה שקופה | Clear Map",
    description: "מערכת מודיעין ויזואלית בזמן אמת — התרעות פיקוד העורף ומודיעין טלגרם",
    images: ["/og-image-wa.jpg"],
  },
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
