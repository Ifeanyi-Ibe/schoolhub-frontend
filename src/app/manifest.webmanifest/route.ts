// Web app manifest, served per request. F0 uses the platform defaults. Per-school name, colours
// and icons come in F1 once the backend exposes public branding (BACKEND_GAPS B-01).
export const dynamic = "force-dynamic";

export function GET(): Response {
  // Scope and start URL stay on this origin so the install boundary is the school's host.
  const manifest = {
    name: "SchoolHub",
    short_name: "SchoolHub",
    description: "School management for parents, teachers and staff",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f7f9",
    theme_color: "#0f5c4d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
