/**
 * Next.js instrumentation hook — runs when the server starts.
 *
 * Fails the process fast when required configuration is missing or invalid, so
 * the portal never serves requests with a broken or default configuration.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("./lib/config/env");
    const env = getEnv(); // throws ConfigError -> startup aborts with a clear, secret-free message

    excludeCoreHostsFromProxy(env.supertokensConnectionUri);

    const { initSuperTokens } = await import("./lib/supertokens/client");
    initSuperTokens(); // local SDK init only; does not contact the Core
  }
}

/**
 * Backend traffic to the SuperTokens Core must not go through a
 * shell-configured HTTP proxy (`HTTPS_PROXY`): the SDK's axios (0.21.x)
 * cannot tunnel https through an http proxy, so requests would be sent
 * cleartext to the proxy and fail — even when the Core is directly
 * reachable. Appends each Core host to NO_PROXY, preserving any entries the
 * deployment already has; axios re-reads these env vars on every request.
 */
function excludeCoreHostsFromProxy(connectionUri: string): void {
  const hosts = connectionUri
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .flatMap((entry) => {
      try {
        return [new URL(entry).hostname];
      } catch {
        return []; // an invalid URI is reported later by getEnv()/SDK init
      }
    });
  if (hosts.length === 0) {
    return;
  }
  const existing = (process.env.NO_PROXY ?? process.env.no_proxy ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const merged = Array.from(new Set([...existing, ...hosts])).join(",");
  process.env.NO_PROXY = merged;
  process.env.no_proxy = merged;
}
