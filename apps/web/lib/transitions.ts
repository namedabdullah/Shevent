// Route transitions (React <ViewTransition>, see node_modules/next/dist/docs/01-app/02-guides/view-transitions.md).
// Links tag a navigation `nav-forward` (deeper, e.g. landing → a category's directory) or `nav-back`;
// pages wrap their content in <ViewTransition {...PAGE_TRANSITION}> so the content slides that way
// (globals.css). Untagged navigations, such as the browser's back button, don't slide.

export const PAGE_TRANSITION = {
  enter: { 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'none' },
  exit: { 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'none' },
  default: 'none',
} as const;
