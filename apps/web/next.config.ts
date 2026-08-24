import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  // A local verification build must not write into the directory the dev server
  // is serving from: the chunk names differ, and the running dev server then
  // fails with "Cannot find module ./vendor-chunks/...". CI and Docker leave
  // this unset and keep writing to .next.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
    ],
  },
  async redirects() {
    return [{ source: "/", destination: "/ar", permanent: false }];
  },
};

export default config;
