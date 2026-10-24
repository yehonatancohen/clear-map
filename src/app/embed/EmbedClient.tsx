"use client";

import dynamic from "next/dynamic";
import MapLoader from "@/components/MapLoader";

const EmbedMap = dynamic(() => import("@/components/EmbedMap"), {
  ssr: false,
  loading: () => <MapLoader />,
});

export default function EmbedClient() {
  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-gray-950">
      <EmbedMap />
    </main>
  );
}
