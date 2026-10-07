import type { DayEntry } from "./stays";

/**
 * Colours for countries in charts (dataviz categorical palette, dark-mode steps,
 * validated on the app's card surface #161b26: all checks pass for 6 slots).
 * Home — where you spend most nights — is a neutral grey so trips stand out.
 * Colours follow the country, ranked over ALL time, so filtering by year never
 * repaints a country.
 */
export const PALETTE = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"];
export const HOME_COLOR = "#5a6478";
export const OTHER_COLOR = "#9aa3b2";

export interface CountryColors {
  home: string | null;
  color: (country: string) => string;
  named: Set<string>; // countries with their own colour (home + palette slots)
}

export function countryColors(log: DayEntry[]): CountryColors {
  const nights = new Map<string, number>();
  for (const d of log) if (d.night) nights.set(d.night.country, (nights.get(d.night.country) ?? 0) + 1);
  const ranked = [...nights].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const home = ranked[0] ?? null;
  const map = new Map<string, string>();
  if (home) map.set(home, HOME_COLOR);
  ranked.slice(1, 1 + PALETTE.length).forEach((c, i) => map.set(c, PALETTE[i]));
  return { home, color: (c) => map.get(c) ?? OTHER_COLOR, named: new Set(map.keys()) };
}
