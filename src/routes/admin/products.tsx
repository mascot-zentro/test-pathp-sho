import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout route for everything under /admin/products. Its only job is to
// render an outlet — the actual list lives in products.index.tsx (exact
// path) and the editor lives in products.$slug.tsx (child path). Without
// this outlet, TanStack Router nests products.$slug under this file (same
// "products." filename prefix), and navigating to /admin/products/<slug>
// would update the URL and match the route internally, but have nowhere
// to mount the editor's component — you'd just keep seeing this file's
// own content, which is exactly the "Edit does nothing" symptom this
// fixes.
export const Route = createFileRoute("/admin/products")({
  component: () => <Outlet />,
});
