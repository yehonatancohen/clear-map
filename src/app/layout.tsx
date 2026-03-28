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
  title: "מפה שקופה | התרעות פיקוד העורף בזמן אמת",
  description: "מפה שקופה — מערכת מודיעין ויזואלית בזמן אמת. התרעות צבע אדום, כטב\"מ ומחבלים של פיקוד העורף על גבי מפה אינטראקטיבית עם מודיעין מוקדם.",
  keywords: ["צבע אדום", "פיקוד העורף", "התרעות", "מפה", "מודיעין", "כטבם", "ישראל", "clearmap", "מפה שקופה", "real time alerts", "Israel alerts", "Red Alert"],
  openGraph: {
    title: "מפה שקופה | התרעות פיקוד העורף בזמן אמת",
    description: "התרעות צבע אדום, כטב\"מ ומחבלים על גבי מפה אינטראקטיבית — בזמן אמת.",
    url: "https://clearmap.co.il",
    siteName: "מפה שקופה",
    locale: "he_IL",
    type: "website",
    images: [
      {
        url: "/og-image-wa.jpg",
        width: 600,
        height: 600,
        alt: "מפה שקופה — התרעות בזמן אמת",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "מפה שקופה | התרעות פיקוד העורף בזמן אמת",
    description: "התרעות צבע אדום, כטב\"מ ומחבלים על גבי מפה אינטראקטיבית — בזמן אמת.",
    images: ["/og-image-wa.jpg"],
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/favicon-192.png", sizes: "192x192", type: "image/png" },
    ],
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
        <meta property="og:logo" content="https://clearmap.co.il/favicon-192.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "מפה שקופה",
              "alternateName": "ClearMap",
              "url": "https://clearmap.co.il",
              "description": "מערכת מודיעין ויזואלית בזמן אמת — התרעות צבע אדום, כטב\"מ ומחבלים של פיקוד העורף על גבי מפה אינטראקטיבית עם מודיעין מוקדם.",
              "applicationCategory": "UtilitiesApplication",
              "operatingSystem": "Web",
              "inLanguage": "he",
              "image": "https://clearmap.co.il/og-image-wa.jpg",
              "logo": "https://clearmap.co.il/favicon-192.png",
              "publisher": {
                "@type": "Organization",
                "name": "מפה שקופה",
                "url": "https://clearmap.co.il",
                "logo": "https://clearmap.co.il/favicon-192.png"
              }
            })
          }}
        />
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

