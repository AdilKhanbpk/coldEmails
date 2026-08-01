// Common timezones for dropdowns. In a production app, this could use the
// browser's Intl.supportedValuesOf('timeZone') API.
export const COMMON_TIMEZONES = Intl.supportedValuesOf("timeZone");


export function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
