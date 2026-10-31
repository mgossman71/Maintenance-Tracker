import { join, normalize, resolve, sep } from "node:path";
import type { MiddlewareHandler } from "hono";

/**
 * Serve the built SPA with a hard root confinement: any path that resolves
 * outside `webDir` falls through to the SPA shell, never to the filesystem.
 * (Auth wraps everything in M2; traversal containment starts now.)
 */
export function staticApp(webDir: string): MiddlewareHandler {
  const root = resolve(webDir);

  return async (c, next) => {
    const method = c.req.method;
    if (method !== "GET" && method !== "HEAD") return next();

    let path: string;
    try {
      path = decodeURIComponent(new URL(c.req.url).pathname);
    } catch {
      return next(); // malformed percent-encoding → not a file we can serve
    }
    if (path.startsWith("/api/")) return next();

    const candidate = confine(root, path);
    if (candidate !== null) {
      const file = Bun.file(candidate);
      if (await file.exists())
        return new Response(file, {
          headers: { "Cache-Control": cacheFor(path) },
        });
    }

    // SPA fallback: client-side routes answer with the shell. The shell is
    // the one file that must NEVER be cached heuristically — it is the only
    // thing pinning the hashed asset names, so a stale shell resurrects an
    // entire old build after a deploy.
    const index = Bun.file(join(root, "index.html"));
    if (await index.exists())
      return new Response(index, { headers: { "Cache-Control": "no-cache" } });
    return c.text("Not found", 404);
  };
}

/**
 * /assets/* names are content-hashed by the bundler → cache forever;
 * everything else (the shell, images at stable names) revalidates.
 */
export function cacheFor(path: string): string {
  return path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
}

/** URL path → absolute path inside root, or null if it escapes. */
export function confine(root: string, urlPath: string): string | null {
  const rel = normalize(urlPath).replace(/^([/\\])+/, "");
  if (rel === "" || rel === ".") return null; // directory → SPA fallback
  const abs = resolve(join(root, rel));
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  return abs;
}
