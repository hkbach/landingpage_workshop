"use client";

import { useState } from "react";

// Pagination of the lists of the system (tables and lists): 10, 20 or 50 rows to a page, 10 by default. The list is cut on the client here (the mock backend sends it
// whole); TODO(api): the real list endpoints take page and pageSize (or a cursor) and return the total.

export const PAGE_SIZES = [10, 20, 50] as const;
export const DEFAULT_PAGE_SIZE = PAGE_SIZES[0];

export interface Page<T> { items: T[]; page: number; pages: number; total: number; from: number; to: number; size: number }

/** One page of a list. A page that does not exist (a list that got shorter) is the nearest one; `from` and `to` are the 1-based numbers of its first and last row. */
export function paginate<T>(list: readonly T[], page: number, size: number): Page<T> {
  const whole = Math.floor(size);
  const safeSize = whole >= 1 ? whole : DEFAULT_PAGE_SIZE;
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / safeSize));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * safeSize;
  const items = list.slice(start, start + safeSize);
  return { items, page: current, pages, total, from: total === 0 ? 0 : start + 1, to: start + items.length, size: safeSize };
}

/** The numbers a pagination bar needs. */
export interface PaginationBarProps { total: number; page: number; pages: number; from: number; to: number; size: number; onPage: (page: number) => void; onSize: (size: number) => void }

/**
 * The page of a list the user is on, and the props of its `PaginationBar`. A change of `resetKey` (the filters, the search, the sort...) goes back to the first
 * page; a new page size does too.
 */
export function usePagination<T>(list: readonly T[], resetKey = "", initialSize: number = DEFAULT_PAGE_SIZE): { items: T[]; bar: PaginationBarProps } {
  const [state, setState] = useState({ page: 1, size: initialSize, key: resetKey });
  const view = paginate(list, state.key === resetKey ? state.page : 1, state.size);
  return {
    items: view.items,
    bar: {
      total: view.total, page: view.page, pages: view.pages, from: view.from, to: view.to, size: view.size,
      onPage: (page) => setState({ page, size: view.size, key: resetKey }),
      onSize: (size) => setState({ page: 1, size, key: resetKey }),
    },
  };
}
