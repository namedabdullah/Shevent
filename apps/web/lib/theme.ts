// Themes (palettes live in app/globals.css). The choice is stored in localStorage and applied to
// <html data-theme> by an inline script before first paint, so there's no flash of the wrong theme.
// A stored choice that no longer exists (Sand, removed 2026-11-15) falls back to System.

export const THEME_STORAGE_KEY = 'shevent-theme';

export const THEME_CHOICES = ['system', 'light', 'dark', 'pine'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];
export type Theme = Exclude<ThemeChoice, 'system'>;

/** Swatches for the picker: page colour and accent. Kept next to the palettes' values in globals.css. */
export const THEME_SWATCHES: Record<Theme, { canvas: string; accent: string }> = {
  light: { canvas: '#f6f6f4', accent: '#c9441a' },
  dark: { canvas: '#0e0d12', accent: '#ff7d5c' },
  pine: { canvas: '#f3f4f1', accent: '#1d5e4a' },
};

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (THEME_CHOICES as readonly string[]).includes(value);
}

/** Inline <head> script: resolve the stored choice ("system" follows the OS) and set it on <html>. */
export const themeScript = `(function(){try{var c=localStorage.getItem('${THEME_STORAGE_KEY}');if(${JSON.stringify(THEME_CHOICES)}.indexOf(c)<0)c='system';var t=c==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):c;var r=document.documentElement;r.dataset.theme=t;r.dataset.themeChoice=c;}catch(e){}})();`;
