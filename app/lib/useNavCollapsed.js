'use client';

import { useCallback, useEffect, useState } from 'react';

const KEY = 'nav:collapsed';

/** Whether the side menu is collapsed to icons; remembered on this browser. */
export function useNavCollapsed() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(KEY) === '1');
    } catch {
      /* no storage */
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(KEY, c ? '0' : '1');
      } catch {
        /* no storage */
      }
      return !c;
    });
  }, []);

  return [collapsed, toggle];
}
