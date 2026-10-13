import test from 'node:test';
import assert from 'node:assert/strict';
import { marketIndex, marketSamples, matchesMarketVariant, parseMarketHistory, parseMarketItems, parseMarketOrders, quoteMarketOrders, resolveMarketTarget } from '../src/lib/market.ts';
import { marketHistoryCsv, panRange, priceRangeStats, zoomRange } from '../src/lib/marketChart.ts';
import { wfmHistory, wfmItems, wfmOrders } from './fixtures/wfm.ts';

test('WFM maps exact variants, sets, blueprints and relic refinements without pricing unlisted equipment', () => {
  const index = marketIndex(parseMarketItems(wfmItems));
  assert.equal(resolveMarketTarget({ name: 'Ash Prime', kind: 'equipment' }, index)?.item.slug, 'ash_prime_set');
  assert.equal(resolveMarketTarget({ name: 'Ash Prime', kind: 'equipment' }, index)?.qualifier, 'set');
  assert.equal(resolveMarketTarget({ name: 'Ash', kind: 'equipment' }, index), null);
  assert.equal(resolveMarketTarget({ name: 'Braton Vandal', kind: 'equipment' }, index), null);
  assert.equal(resolveMarketTarget({ name: 'Ignis Wraith', kind: 'equipment' }, index)?.qualifier, 'blueprint');
  assert.deepEqual(resolveMarketTarget({ name: 'Lith A13', kind: 'relic', refinement: 'Radiant' }, index)?.variant, { subtype: 'radiant' });
  assert.deepEqual(resolveMarketTarget({ name: 'Lith A13 Relic', kind: 'item' }, index)?.variant, { subtype: 'intact' });
  const eterna = resolveMarketTarget({ name: 'Requiem Eterna', kind: 'relic', refinement: 'Unrefined' }, index)!;
  assert.equal(eterna.qualifier, 'Unrefined'); assert.equal(eterna.variant.subtype, 'intact'); assert.match(eterna.note, /WFM labels/);
  assert.deepEqual(resolveMarketTarget({ name: 'Serration', kind: 'item' }, index)?.variant, { rank: 0 });
  assert.equal(resolveMarketTarget({ name: 'Ash Prime Neuroptics Blueprint', kind: 'item' }, index)?.item.slug, 'ash_prime_neuroptics_blueprint');
});

test('current estimate is the median of five distinct online sellers, normalized per item', () => {
  const orders = parseMarketOrders(wfmOrders()), quote = quoteMarketOrders(orders, {});
  assert.equal(quote.price, 14); assert.equal(quote.sample, 5);
  assert.equal(quote.sell.min, 10); assert.equal(quote.sell.max, 999); assert.equal(quote.sell.median, 14);
  assert.equal(quote.sell.listings, 7); assert.equal(quote.sell.units, 54);
  assert.equal(quote.buy.max, 9); assert.equal(quote.spread, 1); assert.equal(quote.offline, 2);
  assert.equal(orders.find(order => order.id === 'bulk')?.price, 10);
  const single = quoteMarketOrders(orders.filter(order => order.userId === 'seller-0'), {});
  assert.equal(single.price, 10); assert.equal(single.sample, 1);
  assert.equal(quoteMarketOrders(orders.filter(order => order.status === 'offline'), {}).price, null);
});

test('ranks, refinements, charges and filled sculptures never contaminate an exact quote', () => {
  const orders = [...parseMarketOrders(wfmOrders('intact')), ...parseMarketOrders(wfmOrders('radiant', 10))];
  assert.equal(quoteMarketOrders(orders, { subtype: 'intact' }).price, 14);
  assert.equal(quoteMarketOrders(orders, { subtype: 'radiant' }).price, 140);
  assert.equal(quoteMarketOrders(orders, { subtype: 'flawless' }).price, null);
  assert.equal(matchesMarketVariant({}, { rank: 0 }), false);
  assert.equal(matchesMarketVariant({ rank: 10 }, { rank: 0 }), false);
  assert.equal(matchesMarketVariant({ rank: 0, charges: 3 }, { rank: 0, charges: 3 }), true);
  assert.equal(matchesMarketVariant({ amberStars: 2, cyanStars: 2 }, { amberStars: 0, cyanStars: 0 }), false);
});

test('history keeps missing prices empty and distinguishes closed trades from listing medians', () => {
  const history = parseMarketHistory(wfmHistory('radiant'));
  const samples = marketSamples(history, { subtype: 'radiant' }, '90days');
  assert.equal(samples.length, 90); assert.equal(samples[10].closed, null); assert.equal(samples[10].volume, null);
  assert.equal(samples[10].sell, 17); assert.equal(samples[10].buy, 11);
  assert.equal(marketSamples(history, { subtype: 'intact' }, '90days').length, 0);
  const stats = priceRangeStats(samples);
  assert.equal(stats.weighted, 15); assert.equal(stats.min, 8); assert.equal(stats.max, 25);
  assert.equal(stats.volume, samples.reduce((sum, sample) => sum + (sample.volume ?? 0), 0));
  assert.match(marketHistoryCsv([samples[10]]), /"",\"17\",\"11\",\"\"/);
  assert.deepEqual(priceRangeStats([]), { volume: null, weighted: null, min: null, max: null });
});

test('bad upstream responses cannot become zero prices or invented history', () => {
  for (const value of [{}, { data: null }, { data: [] }]) assert.throws(() => parseMarketItems(value));
  assert.throws(() => parseMarketOrders({ data: null })); assert.throws(() => parseMarketHistory({ payload: {} }));
  const invalid = { data: wfmOrders().data.map(order => ({ ...order, platinum: NaN })) };
  assert.deepEqual(parseMarketOrders(invalid), []);
  const history = wfmHistory(); history.payload.statistics_closed['90days'][0].median = NaN;
  assert.equal(marketSamples(parseMarketHistory(history), {}, '90days')[0].closed, null);
});

test('chart ranges clamp zoom and pan, keeping at least two timestamps when available', () => {
  assert.deepEqual(zoomRange({ start: 0, end: 89 }, 90, 0.5, 89), { start: 44, end: 89 });
  assert.deepEqual(zoomRange({ start: 44, end: 89 }, 90, 2, 89), { start: 0, end: 89 });
  assert.deepEqual(zoomRange({ start: 4, end: 5 }, 90, 0.1, 5), { start: 4, end: 5 });
  assert.deepEqual(panRange({ start: 0, end: 10 }, 90, -1), { start: 0, end: 10 });
  assert.deepEqual(panRange({ start: 79, end: 89 }, 90, 1), { start: 79, end: 89 });
  assert.deepEqual(zoomRange({ start: 0, end: 0 }, 1, 2, 0), { start: 0, end: 0 });
});
