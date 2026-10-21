// Umami funnel events (WEB_APP_PLAN §5.3). Page views are tracked automatically by the script.

export type AnalyticsEvent =
  // Host funnel
  | 'try_widget_used'
  | 'signup'
  | 'plan_created'
  | 'inquiry_sent'
  | 'booking_simulated'
  // Vendor funnel
  | 'vendor_join_submitted'
  | 'vendor_onboarded'
  | 'quote_sent'
  // Lead capture
  | 'waitlist_joined';

declare global {
  interface Window {
    umami?: { track(event: string, data?: Record<string, string | number | boolean>): void };
  }
}

export function track(event: AnalyticsEvent, data?: Record<string, string | number | boolean>): void {
  try {
    window.umami?.track(event, data);
  } catch {
    // Analytics must never break the page.
  }
}
