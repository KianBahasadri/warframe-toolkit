import data from './catalog.json';
import type { CatalogItem } from '../lib/model';

export const catalog = data.items as CatalogItem[];
export const catalogDate = data.retrievedAt;
