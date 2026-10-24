import type { Metadata } from "next";
import EmbedClient from "./EmbedClient";

export const metadata: Metadata = {
  title: "מפה שקופה | מפת התרעות חיה",
  robots: { index: false, follow: true },
};

export default function EmbedPage() {
  return <EmbedClient />;
}
