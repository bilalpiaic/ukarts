// Fresh-start contract shared by the Settings UI (client) and the admin API
// (server). Kept free of database imports so it is safe in both bundles.

/** The admin must type this phrase before any entry is deleted. */
export const FRESH_START_PHRASE = "FRESH START";

/** How much to clear: documents only, or documents plus the master records. */
export type FreshStartScope = "ENTRIES" | "ENTRIES_AND_MASTERS";

export const FRESH_START_SCOPES: FreshStartScope[] = [
  "ENTRIES_AND_MASTERS",
  "ENTRIES",
];

export interface DataFootprint {
  entries: { label: string; count: number }[];
  masters: { label: string; count: number }[];
  totalEntries: number;
  totalMasters: number;
  lastFreshStart: string | null;
}
