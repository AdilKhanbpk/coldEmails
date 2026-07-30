// ---------------------------------------------------------------------------
// Email tracking helpers — wraps email body with open pixel and click links.
// ---------------------------------------------------------------------------

const APP_BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

// Inject a tracking pixel at the end of the email body (for open tracking)
// and wrap all URLs with click-tracking redirects.
export function addTrackingToEmail(body: string, messageId: string): string {
  const withClickTracking = wrapLinksWithTracking(body, messageId);
  const trackingPixel = `\n\n<img src="${APP_BASE_URL}/api/track/open?m=${messageId}" width="1" height="1" alt="" style="display:none;" />`;
  return withClickTracking + trackingPixel;
}

// Wrap all http/https URLs in the text with click-tracking redirects.
// For plain-text emails, we replace URLs with the tracking redirect URL.
// For HTML emails, we'd rewrite href attributes — but since our sender
// currently uses text/plain, we append an HTML tracking section.
export function wrapLinksWithTracking(text: string, messageId: string): string {
  const urlRegex = /https?:\/\/[^\s<>"']+/g;
  return text.replace(urlRegex, (url) => {
    const encoded = encodeURIComponent(url);
    return `${APP_BASE_URL}/api/track/click?m=${messageId}&u=${encoded}`;
  });
}

// Create an HTML version of the email body with tracking for providers that support HTML.
export function createTrackedHtmlBody(textBody: string, messageId: string): string {
  // Escape HTML
  const escaped = textBody
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>\n');

  // Wrap URLs with tracking redirects
  const urlRegex = /https?:\/\/[^\s<>"']+/g;
  const withLinks = escaped.replace(urlRegex, (url) => {
    const encoded = encodeURIComponent(url);
    const trackUrl = `${APP_BASE_URL}/api/track/click?m=${messageId}&u=${encoded}`;
    return `<a href="${trackUrl}">${url}</a>`;
  });

  // Add tracking pixel
  const pixel = `<img src="${APP_BASE_URL}/api/track/open?m=${messageId}" width="1" height="1" alt="" style="display:none;" />`;

  return `<html><body>${withLinks}${pixel}</body></html>`;
}
