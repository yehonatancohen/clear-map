import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";
import { PwaRegistry } from "@/components/PwaRegistry";
import { SettingsProvider } from "@/hooks/useNotificationSettings";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#030712",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://clearmap.co.il"),
  title: "מפה שקופה",
  description: "מערכת מודיעין ויזואלית בזמן אמת — התרעות פיקוד העורף ומודיעין מוקדם",
  keywords: ["צבע אדום", "מפה", "מודיעין", "התרעות", "פיקוד העורף", "כטבם", "טלגרם", "ישראל", "clear map"],
  openGraph: {
    title: "מפה שקופה",
    description: "מערכת מודיעין ויזואלית בזמן אמת — התרעות פיקוד העורף ומודיעין מוקדם",
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
    title: "מפה שקופה",
    description: "מערכת מודיעין ויזואלית בזמן אמת — התרעות פיקוד העורף ומודיעין מוקדם",
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
          crossOrigin="anonymous"
        />
        <meta property="og:logo" content="https://clearmap.co.il/logo-light-theme.png" />
      </head>
      <body>
        <SettingsProvider>
          <PwaRegistry />
          {children}
        </SettingsProvider>
        <Analytics />
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-913361R4FS" strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-913361R4FS');
          `}
        </Script>
      </body>
    </html>
  );
}

