/** City label for check-ins where only the country is known. */
export const APPROX_SUFFIX = " (city unknown)";
export const isApproxCity = (city: string) => city.endsWith(APPROX_SUFFIX);
