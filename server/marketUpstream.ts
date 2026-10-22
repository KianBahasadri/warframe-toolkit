export const MARKET_ORIGIN = 'https://api.warframe.market';
export const MARKET_USER_AGENT = 'Grakata/0.1 (+https://grakata.com; https://github.com/KianBahasadri/warframe-toolkit)';

export function isMarketPath(path: string) {
  return /^\/(?:v2\/items|v2\/orders\/item\/[a-z0-9_]{1,100}|v1\/items\/[a-z0-9_]{1,100}\/statistics)$/.test(path);
}

export function marketHeaders(platform: string) {
  return new Headers({ Accept: 'application/json', Language: 'en', Platform: platform, Crossplay: 'false', 'User-Agent': MARKET_USER_AGENT });
}
