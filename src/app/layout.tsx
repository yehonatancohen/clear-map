import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "מפה שקופה | Clear Map",
  description: "לוח בקרה טקטי בזמן אמת להתרעות רקטות בישראל",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
