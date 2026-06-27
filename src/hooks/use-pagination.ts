import { useState, useEffect } from "react";

export function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever the filtered list changes
  useEffect(() => { setPage(1); }, [items.length]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const start = (page - 1) * pageSize;
  const paged = items.slice(start, start + pageSize);

  return { paged, page, setPage, totalPages, total: items.length, start, end: start + paged.length };
}
