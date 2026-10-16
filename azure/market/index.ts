import { handleMarketRelay } from './handler.ts';

// The dependency-free Node programming model uses function.json for registration.
export async function relay(context: { res?: unknown }, request: { url: string; method: string; headers: Record<string, string> }) {
  const response = await handleMarketRelay(new Request(request.url, { method: request.method, headers: request.headers }));
  context.res = { status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() };
}
