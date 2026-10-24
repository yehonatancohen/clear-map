import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/oref-history",
        destination:
          "https://alerts-history.oref.org.il//Shared/Ajax/GetAlarmsHistory.aspx",
      },
    ];
  },
  async headers() {
    return [
      {
        // Static geo data: let browsers and the CDN reuse it instead of
        // revalidating ~0.4 MB of polygons on every visit. URLs carry a ?v=
        // so a regenerated file is picked up immediately.
        source: "/data/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=604800" },
        ],
      },
      {
        // News sites embed /embed in an iframe.
        source: "/embed",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default nextConfig;
