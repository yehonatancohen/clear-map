import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "מפה שקופה | Clear Map",
  description: "מערכת מודיעין ויזואלית בזמן אמת — התרעות פיקוד העורף ומודיעין טלגרם",
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
      <body>{children}</body>
    </html>
  );
}
