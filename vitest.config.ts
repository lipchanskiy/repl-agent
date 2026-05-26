import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    // Allow TypeScript source files to be found when imported with .js extension
    // (Node ESM convention: import "./foo.js" resolves to "./foo.ts" during tests)
    extensionOrder: [".ts", ".js"],
  },
});
