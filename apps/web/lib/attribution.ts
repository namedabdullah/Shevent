// First-touch attribution for the leads table: UTM tags, external referrer and landing path from
// the first page a visitor opens in this browser session.

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer?: string;
  landing_path?: string;
}

const STORAGE_KEY = 'shevent:attribution';

function externalReferrer(): string | undefined {
  try {
    if (document.referrer && new URL(document.referrer).origin !== window.location.origin) return document.referrer;
  } catch {
    // Malformed referrer
  }
  return undefined;
}

function readCurrentPage(): Attribution {
  const params = new URLSearchParams(window.location.search);
  const referrer = externalReferrer();
  return {
    utm_source: params.get('utm_source') ?? undefined,
    utm_medium: params.get('utm_medium') ?? undefined,
    utm_campaign: params.get('utm_campaign') ?? undefined,
    referrer,
    landing_path: window.location.pathname,
  };
}

/** Call once per page load; only the first call in a session is kept. */
export function captureAttribution(): void {
  try {
    if (sessionStorage.getItem(STORAGE_KEY)) return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(readCurrentPage()));
  } catch {
    // Storage can be blocked (private mode); getAttribution falls back to the current page.
  }
}

export function getAttribution(): Attribution {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as Attribution;
  } catch {
    // Fall through to the current page.
  }
  return readCurrentPage();
}
