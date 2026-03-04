"use client";

import dynamic from "next/dynamic";
import MapLoader from "@/components/MapLoader";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <MapLoader />,
});

export default function Home() {
  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-gray-950">
      <MapView />
    </main>
  );
}
