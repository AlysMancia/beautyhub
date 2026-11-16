'use client';

/** Compact "1–50 of 674  ‹ 1 2 3 … 14 ›  [50 ▾]" pager for server-side lists. */
export default function Pager({ list, sizes = [25, 50, 100], label = 'items', className = '' }) {
  const { page, setPage, perPage, setPerPage, total } = list;
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (!total) return null;

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  // Page numbers around the current one.
  const nums = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }

  return (
    <div className={`pager ${className}`}>
      <span className="pager-info">
        {from}–{to} of {total.toLocaleString()} {label}
        {list.loading && <i className="fa-solid fa-spinner fa-spin" style={{ marginLeft: 6 }} />}
      </span>
      {pages > 1 && (
        <span className="pager-pages">
          <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Previous page">‹</button>
          {nums.map((n, i) =>
            n === '…' ? (
              <span key={`e${i}`} className="pager-gap">…</span>
            ) : (
              <button key={n} type="button" className={n === page ? 'on' : ''} onClick={() => setPage(n)} aria-current={n === page ? 'page' : undefined}>
                {n}
              </button>
            )
          )}
          <button type="button" onClick={() => setPage(page + 1)} disabled={page >= pages} aria-label="Next page">›</button>
        </span>
      )}
      {sizes.length > 1 && (
        <select className="pager-size" value={perPage} onChange={(e) => setPerPage(Number(e.target.value))} aria-label="Rows per page">
          {sizes.map((s) => <option key={s} value={s}>{s} / page</option>)}
        </select>
      )}
    </div>
  );
}
