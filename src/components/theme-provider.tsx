"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";
const ThemeContext = React.createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "system",
  setTheme: () => {},
});

export function useTheme() {
  return React.useContext(ThemeContext);
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
  root.style.colorScheme = isDark ? "dark" : "light";
}

/**
 * Theme preference is persisted per user (server-side, `user_preferences.theme`)
 * and mirrored into localStorage so the choice survives a hard refresh with no flash.
 */
export function ThemeProvider({
  children, initialTheme = "system", onPersist,
}: { children: React.ReactNode; initialTheme?: Theme; onPersist?: (theme: Theme) => void }) {
  const [theme, setThemeState] = React.useState<Theme>(initialTheme);

  React.useEffect(() => {
    const stored = window.localStorage.getItem("wb-theme") as Theme | null;
    const next = stored ?? initialTheme;
    setThemeState(next);
    applyTheme(next);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => { if ((window.localStorage.getItem("wb-theme") ?? initialTheme) === "system") applyTheme("system"); };
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [initialTheme]);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    window.localStorage.setItem("wb-theme", next);
    applyTheme(next);
    onPersist?.(next);
  }, [onPersist]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const options: Array<{ value: Theme; label: string; icon: React.ReactNode }> = [
    { value: "light", label: "Light", icon: <Sun size={14} /> },
    { value: "dark", label: "Dark", icon: <Moon size={14} /> },
    { value: "system", label: "System", icon: <Monitor size={14} /> },
  ];
  return (
    <div className={cn("inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5", className)} role="group" aria-label="Theme">
      {options.map((o) => (
        <button
          key={o.value} onClick={() => setTheme(o.value)} aria-pressed={theme === o.value} title={`${o.label} theme`}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium transition-colors",
            theme === o.value ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--foreground)]",
          )}
        >
          {o.icon}
          <span className="hidden sm:inline">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Inline script that applies the stored theme before first paint. */
export const themeScript = `(function(){try{var t=localStorage.getItem('wb-theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
