// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Outside the Lovable sandbox (e.g. building on Vercel), the wrapper only
// runs the nitro build plugin at all if `nitro` is explicitly set here —
// otherwise it silently skips SSR/server bundling entirely and you'd get
// a client-only build that can't serve the app's routes or API/server
// functions. And when nitro *is* enabled, its fallback default is the
// Cloudflare Workers preset, not Node/Vercel. Force the `vercel` preset
// explicitly so `vercel build` produces the right serverless output
// (nitro has zero-config support for Vercel beyond this).
export default defineConfig({
  nitro: {
    preset: "vercel",
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
