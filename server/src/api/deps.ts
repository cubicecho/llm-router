import type { ConfigStore } from '../config/store.ts';
import type { ModelCatalog } from '../gateway/models.ts';
import type { UsageStore } from '../usage/store.ts';

/** Everything the REST routes are built over; each route module takes the whole set. */
export interface ApiDeps {
  store: ConfigStore;
  /** Lists each provider's models. */
  catalog: ModelCatalog;
  /** Counts the requests and tokens of each provider's models. */
  usage: UsageStore;
}
