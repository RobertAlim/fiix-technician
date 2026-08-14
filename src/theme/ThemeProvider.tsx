// src/theme/ThemeProvider.tsx
//
// Single source of truth for which palette is active. Persists the user's
// explicit choice (AsyncStorage) so it survives app restarts; if they've
// never chosen, falls back to the OS's light/dark setting via
// react-native's Appearance API and follows it live — same default
// behavior the web app effectively has (no explicit toggle there either,
// renders whatever the OS/browser prefers).
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkPalette, lightPalette, Palette } from "./palettes";

type ThemeMode = "light" | "dark";
const STORAGE_KEY = "fiix-theme-mode";

interface ThemeContextValue {
  theme: Palette;
  mode: ThemeMode;
  /** True only when the user has explicitly picked a mode; false while
   *  still following the OS setting. Lets settings UI show "System" vs
   *  the explicit choice accurately. */
  isExplicit: boolean;
  setMode: (mode: ThemeMode | "system") => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [explicitMode, setExplicitMode] = useState<ThemeMode | null>(null);
  const [systemMode, setSystemMode] = useState<ThemeMode>(
    Appearance.getColorScheme() === "light" ? "light" : "dark"
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === "light" || saved === "dark") setExplicitMode(saved);
      setLoaded(true);
    });
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemMode(colorScheme === "light" ? "light" : "dark");
    });
    return () => sub.remove();
  }, []);

  const mode: ThemeMode = explicitMode ?? systemMode;

  const setMode = (next: ThemeMode | "system") => {
    if (next === "system") {
      setExplicitMode(null);
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    } else {
      setExplicitMode(next);
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
    }
  };

  const toggleTheme = () => setMode(mode === "dark" ? "light" : "dark");

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: mode === "light" ? lightPalette : darkPalette,
      mode,
      isExplicit: explicitMode !== null,
      setMode,
      toggleTheme,
    }),
    [mode, explicitMode]
  );

  // Renders with the best-guess (system) theme immediately rather than
  // blocking on the AsyncStorage read — avoids a flash of an unstyled or
  // wrong-theme screen while `loaded` catches up a moment later.
  void loaded;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useAppTheme must be used within ThemeProvider");
  return ctx;
}
