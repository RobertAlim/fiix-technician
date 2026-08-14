// src/theme/palettes.ts
//
// Both palettes converted directly from the web app's actual CSS
// variables (app/globals.css — the :root block for light, .dark for dark)
// via a real OKLCH->sRGB conversion, not eyeballed. React Native has no
// oklch() support, so these hex values are the mobile equivalent of the
// same design tokens the web app defines for each mode. If the web app's
// palette ever changes, re-run the same conversion against the new
// values rather than hand-picking new hex codes, so the two stay in sync
// by construction.
export interface Palette {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  destructive: string;
  success: string;
  info: string;
  warning: string;
  border: string;
  radius: number;
}

export const darkPalette: Palette = {
  background: "#010d16",
  foreground: "#e4f3ea",
  card: "#071727",
  cardForeground: "#e4f3ea",
  primary: "#00bb90",
  primaryForeground: "#010d16",
  secondary: "#002635",
  secondaryForeground: "#c8e8cd",
  muted: "#1b3236",
  mutedForeground: "#6ebfb9",
  accent: "#004254",
  destructive: "#ff5c82",
  success: "#43b966",
  info: "#00bad1",
  warning: "#e9ab2b",
  border: "rgba(255,255,255,0.1)",
  radius: 16,
};

export const lightPalette: Palette = {
  background: "#f2f5fb",
  foreground: "#0d1b2d",
  card: "#ffffff",
  cardForeground: "#0d1b2d",
  primary: "#0462d3",
  primaryForeground: "#fafafa",
  secondary: "#d8efd8",
  secondaryForeground: "#14361d",
  muted: "#edf2fa",
  mutedForeground: "#515f6e",
  accent: "#e2f0ff",
  destructive: "#f92434",
  success: "#1eab53",
  info: "#00b5ce",
  warning: "#e2a000",
  border: "#e1e5eb",
  radius: 16,
};
