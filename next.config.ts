import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native addon and must never be bundled.
  //
  // supertokens-node is deliberately NOT listed here: its main entry would
  // be externalized while its recipe subpaths (the package has no "exports"
  // map, so Node.js cannot resolve them) get bundled anyway — producing two
  // SDK copies whose Querier singletons diverge and fail startup with
  // "Please call the supertokens.init function before using SuperTokens".
  // Keeping it out makes Turbopack bundle every import as one copy.
  serverExternalPackages: ["better-sqlite3"],
  output: "standalone",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
