import type { ConfigStore } from '../config/store.ts';
import type { ModelCatalog } from '../gateway/models.ts';

/** Everything the REST routes are built over; each route module takes the whole set. */
export interface ApiDeps {
  store: ConfigStore;
  /** Lists each provider's models. */
  catalog: ModelCatalog;
}
