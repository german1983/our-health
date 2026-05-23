import { useEffect, useState } from 'react';

export type NutritionMode = 'per100g' | 'perServing';

const STORAGE_KEY = 'nutrition-mode';
const DEFAULT_MODE: NutritionMode = 'per100g';

function readMode(): NutritionMode {
  if (typeof window === 'undefined') return DEFAULT_MODE;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'perServing' || v === 'per100g' ? v : DEFAULT_MODE;
}

export function useNutritionMode(): [NutritionMode, (m: NutritionMode) => void] {
  const [mode, setModeState] = useState<NutritionMode>(readMode);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setModeState(readMode());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function setMode(next: NutritionMode) {
    setModeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return [mode, setMode];
}
