export const DEFAULT_SETTINGS = { perPage: "auto" };

/**
 * Reads stored or imported settings, keeping only values tilde understands and filling
 * in defaults for the rest. Always returns a complete settings object.
 */
export function readSettings(stored) {
  const perPage = stored?.perPage;
  return {
    perPage: perPage === "auto" || (Number.isInteger(perPage) && perPage >= 1) ? perPage : DEFAULT_SETTINGS.perPage,
  };
}
