// Synthetic public API examples. No live prices or WFM user data are retained.
export const wfmItems = { data: [
  { id: 'ash', slug: 'ash_prime_set', gameRef: '/Lotus/Powersuits/Ninja/AshPrime', tags: ['set', 'prime', 'warframe'], ducats: 170, i18n: { en: { name: 'Ash Prime Set' } } },
  { id: 'braton', slug: 'braton_prime_set', tags: ['set', 'prime', 'weapon'], i18n: { en: { name: 'Braton Prime Set' } } },
  { id: 'secura', slug: 'secura_dual_cestra', tags: ['weapon'], i18n: { en: { name: 'Secura Dual Cestra' } } },
  { id: 'lith', slug: 'lith_a13_relic', tags: ['relic'], subtypes: ['intact', 'exceptional', 'flawless', 'radiant'], i18n: { en: { name: 'Lith A13 Relic' } } },
  { id: 'eterna', slug: 'requiem_eterna_relic', tags: ['relic'], subtypes: ['intact', 'exceptional', 'flawless', 'radiant'], i18n: { en: { name: 'Requiem Eterna Relic' } } },
  { id: 'part', slug: 'ash_prime_neuroptics_blueprint', tags: ['blueprint'], i18n: { en: { name: 'Ash Prime Neuroptics Blueprint' } } },
  { id: 'paris', slug: 'paris_prime_lower_limb', tags: ['component'], i18n: { en: { name: 'Paris Prime Lower Limb' } } },
  { id: 'mod', slug: 'serration', tags: ['mod'], maxRank: 10, i18n: { en: { name: 'Serration' } } },
  { id: 'ignis', slug: 'ignis_wraith_blueprint', tags: ['blueprint', 'weapon'], i18n: { en: { name: 'Ignis Wraith Blueprint' } } },
] };
export function wfmOrders(subtype?: string, multiplier = 1) {
  const order = (id: string, price: number, type = 'sell', status = 'ingame') => ({ id, platinum: price * multiplier, quantity: 6, perTrade: 1, type, visible: true, ...(subtype ? { subtype } : {}), user: { id, status, platform: 'pc', crossplay: false } });
  return { data: [
    ...[10, 12, 14, 16, 18, 999].map((price, index) => order(`seller-${index}`, price)),
    { ...order('bulk', 30), perTrade: 3, quantity: 18, user: { id: 'seller-0', status: 'online' } },
    order('offline', 1, 'sell', 'offline'), { ...order('hidden', 1), visible: false },
    order('buyer-1', 8, 'buy', 'online'), order('buyer-2', 9, 'buy'), order('offline-buyer', 100, 'buy', 'offline'),
  ] };
}
export function wfmHistory(subtype?: string, multiplier = 1) {
  const bins = (step: number, count: number) => Array.from({ length: count }, (_, index) => ({
    datetime: new Date(Date.UTC(2026, 9, 13, 0) - (count - 1 - index) * step).toISOString(),
    volume: 10 + index, median: (12 + index % 8) * multiplier, min_price: 8 * multiplier, max_price: 25 * multiplier,
    avg_price: 16 * multiplier, wa_price: 15 * multiplier, ...(subtype ? { subtype } : {}),
  }));
  const daily = bins(86_400_000, 90), hourly = bins(3_600_000, 48);
  return { payload: {
    statistics_closed: { '90days': daily.filter((_row, index) => index !== 10), '48hours': hourly.filter((_row, index) => index !== 15) },
    statistics_live: { '90days': daily.flatMap(row => [{ ...row, order_type: 'sell', median: row.median + 3 }, { ...row, order_type: 'buy', median: row.median - 3 }]), '48hours': hourly.flatMap(row => [{ ...row, order_type: 'sell', median: row.median + 3 }, { ...row, order_type: 'buy', median: row.median - 3 }]) },
  } };
}
