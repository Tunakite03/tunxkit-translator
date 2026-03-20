import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
   theme: Theme;
   setTheme: (t: Theme) => void;
   toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
   const [theme, setThemeState] = useState<Theme>(() => {
      try {
         return (localStorage.getItem('app-theme') as Theme) || 'light';
      } catch {
         return 'light';
      }
   });

   useEffect(() => {
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(theme);
      try {
         localStorage.setItem('app-theme', theme);
      } catch {}
   }, [theme]);

   const setTheme = useCallback((t: Theme) => setThemeState(t), []);
   const toggleTheme = useCallback(() => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')), []);

   return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
   const ctx = useContext(ThemeContext);
   if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
   return ctx;
}
