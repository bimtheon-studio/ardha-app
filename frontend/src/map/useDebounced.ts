import { useEffect, useState } from 'react';

/** La valeur, une fois stable pendant `delayMs`. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [stable, setStable] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setStable(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return stable;
}
