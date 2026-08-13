/**
 * Shared chart colour constants.
 *
 * Every chart-rendering surface (visualisation builder, classroom/teacher
 * analytics, live-session chart playback for students/guests) should import
 * fills from here instead of hard-coding hex values per component. Two
 * reasons:
 *
 *  1. Consistency — one palette, one place to change it.
 *  2. Accessibility — anywhere colour is used to distinguish *categories*
 *     (pie slices, multi-series bar/line), it must be distinguishable under
 *     colour vision deficiency. CHART_CATEGORICAL is the Okabe & Ito (2008)
 *     8-colour palette, the standard reference palette for staying legible
 *     under protanopia, deuteranopia and tritanopia.
 *
 * CHART_PRIMARY is the single accent used for *single*-series charts (one
 * bar/line/scatter fill — nothing to visually distinguish it from), so it
 * stays on-brand rather than pulling from the categorical set.
 */

/** Okabe–Ito colour-blind-safe 8-colour palette. Use for any chart where
 *  colour is how a viewer tells categories/series apart (pie slices,
 *  multi-series bar/line). Index with `categoricalColor()` so callers never
 *  hard-code the wrap-around. */
export const CHART_CATEGORICAL = [
  '#E69F00', // orange
  '#56B4E9', // sky blue
  '#009E73', // bluish green
  '#F0E442', // yellow
  '#0072B2', // blue
  '#D55E00', // vermillion
  '#CC79A7', // reddish purple
  '#000000', // black
] as const;

export function categoricalColor(index: number): string {
  return CHART_CATEGORICAL[index % CHART_CATEGORICAL.length];
}

/** Thin outline drawn around every pie/donut wedge so a slice filled with a
 *  pale palette colour (e.g. the Okabe-Ito yellow) still reads as a distinct
 *  shape against a white card instead of washing out. */
export const CHART_PIE_STROKE = '#374151';

/** Brand accent for single-series charts (nothing to distinguish it from,
 *  so no colour-blind concern — kept on-brand instead of categorical). */
export const CHART_PRIMARY = '#7c3aed';
export const CHART_PRIMARY_MUTED = '#a78bfa';

export const CHART_TOOLTIP_STYLE = {
  backgroundColor: '#ffffff',
  border: '1px solid #e4e0f8',
  borderRadius: '12px',
  color: '#374151',
  fontSize: 12,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
} as const;

/** Axis tick colour. Recharts renders ticks as real SVG text, so this needs
 *  to clear WCAG AA (4.5:1) on a white card same as any other label —
 *  gray-500 (#6b7280) does, gray-400 (the old default here) does not
 *  (~2.5:1). */
export const CHART_AXIS_STYLE = { fill: '#6b7280', fontSize: 11 } as const;
