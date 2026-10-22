export function legacyRedirect(request: Request, env: { ACCOUNTS_ORIGIN: string; LEGACY_ORIGIN?: string }) {
  if (!env.LEGACY_ORIGIN) return undefined;
  const current = new URL(request.url);
  const legacy = new URL(env.LEGACY_ORIGIN);
  const app = new URL(env.ACCOUNTS_ORIGIN);
  if (current.hostname !== legacy.hostname || current.hostname === app.hostname) return undefined;
  current.protocol = app.protocol;
  current.hostname = app.hostname;
  current.port = app.port;
  return Response.redirect(current.href, 301);
}
