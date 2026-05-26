import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Mode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme';

function readStored(): Mode {
  if (typeof window === 'undefined') return 'system';
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

/** Apply the resolved mode to <html> so CSS picks it up. */
function apply(mode: Mode) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  if (mode === 'light') root.classList.add('light');
  else if (mode === 'dark') root.classList.add('dark');
  // system: leave class off; @media (prefers-color-scheme: dark) takes over.
}

/**
 * Header toggle that flips between light → dark → system. Three states keep
 * the user in control without making them babysit it — once they're happy,
 * just leave it on system. Choice persists in localStorage.
 */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>(() => readStored());

  useEffect(() => {
    apply(mode);
  }, [mode]);

  function cycle() {
    setMode((m) => {
      const next: Mode = m === 'light' ? 'dark' : m === 'dark' ? 'system' : 'light';
      if (next === 'system') window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }

  const label = mode === 'light' ? 'Light' : mode === 'dark' ? 'Dark' : 'Auto';

  return (
    <button
      type="button"
      onClick={cycle}
      title={`Theme: ${label} (click to cycle)`}
      aria-label={`Theme: ${label}`}
      className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
    >
      {mode === 'dark' ? (
        <Moon className="h-4 w-4" />
      ) : mode === 'light' ? (
        <Sun className="h-4 w-4" />
      ) : (
        <span className="text-[10px] font-medium tracking-wide">AUTO</span>
      )}
    </button>
  );
}
