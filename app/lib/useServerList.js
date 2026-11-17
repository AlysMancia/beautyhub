'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/**
 * A list that is searched, filtered and paged on the server.
 *   const list = useServerList('list_products', { q: '', brand: '' }, { perPage: 50 });
 *   list.data, list.loading, list.filters, list.setFilter('q', 'belo'), list.page, list.setPage(2), list.reload()
 * Typing in `q` waits 300 ms before asking the server. Changing a filter goes back to page 1.
 */
export function useServerList(functionName, initialFilters = {}, { perPage = 50, extra = {} } = {}) {
  const [filters, setFilters] = useState(initialFilters);
  const [query, setQuery] = useState(initialFilters); // filters actually sent (q debounced)
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(perPage);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const extraKey = JSON.stringify(extra);

  // Debounce text search; other filters apply at once.
  useEffect(() => {
    const changedOnlyQ = Object.keys(filters).every((k) => k === 'q' || filters[k] === query[k]);
    if (changedOnlyQ && filters.q !== query.q) {
      const t = setTimeout(() => setQuery(filters), 300);
      return () => clearTimeout(t);
    }
    if (JSON.stringify(filters) !== JSON.stringify(query)) setQuery(filters);
    return undefined;
  }, [filters, query]);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    const params = { ...JSON.parse(extraKey), page, per_page: size };
    Object.entries(query).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) params[k] = v;
    });
    const result = await api(functionName, params);
    if (id !== seq.current) return; // a newer request is on its way
    setLoading(false);
    if (result.success) {
      setData(result);
      setError('');
      // Went past the end (e.g. after deleting the last row of a page).
      if (result.total !== undefined && page > 1 && (page - 1) * size >= result.total) setPage(Math.max(1, Math.ceil(result.total / size)));
    } else {
      setError(result.message || 'Could not load.');
    }
  }, [functionName, query, page, size, extraKey]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  return {
    data, loading, error, filters, setFilter, page, setPage, perPage: size,
    setPerPage: (n) => { setSize(n); setPage(1); },
    total: data?.total ?? 0,
    reload: load,
    /** Update the loaded data in place (e.g. one edited row) without asking the server again. */
    mutate: setData,
  };
}
