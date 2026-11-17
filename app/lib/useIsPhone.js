'use client';

import { useEffect, useState } from 'react';

/** True on phone-sized screens (same breakpoint as the dashboard's phone layout). */
export function useIsPhone(query = '(max-width: 900px)') {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatch(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return match;
}
