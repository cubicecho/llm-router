// Every value in the UI someone might tune, as plain data. Nothing here computes or imports.

/** How often the UI re-reads live data, and how long it trusts what it has. */
export interface PollingSettings {
  /** Router status in the sidebar and settings page, in ms. */
  statusMs: number;
  /** How long a model listing is reused before it is fetched again, in ms. Fetching calls every provider in scope. */
  modelsStaleMs: number;
  /** Request and token counts on the provider and workspace pages, in ms. */
  usageMs: number;
}

/** The polling intervals and stale times the query hooks use. */
export const POLLING_DEFAULTS: Readonly<PollingSettings> = Object.freeze({
  statusMs: 15_000,
  modelsStaleMs: 60_000,
  usageMs: 15_000,
});

/** How much of the usage a card shows before it is asked for more. */
export interface UsageViewSettings {
  /** How many of the most recent days a usage card lists before "Show all days". */
  recentDays: number;
}

/** What a usage card shows by default. */
export const USAGE_VIEW_DEFAULTS: Readonly<UsageViewSettings> = Object.freeze({
  recentDays: 14,
});
