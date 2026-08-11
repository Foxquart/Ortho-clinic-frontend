import type { Paginated } from '@/api/schema'

/**
 * Repair a pagination envelope whose `total` the server got wrong.
 *
 * `GET /appointments` and `GET /audit-logs` build their count as
 * `select(func.count()).where(*conditions)` with no `select_from(Model)`. When
 * no filter is applied there are no conditions, so Postgres is handed a bare
 * `SELECT count(*)` with no FROM clause and dutifully answers `1`.
 *
 * Left alone this is not cosmetic: `pages` collapses to 1, the next-page
 * control disables, and every record past the first page becomes unreachable.
 *
 * We can detect the lie exactly — a page cannot contain more rows than the
 * collection holds — and we can establish a floor, but not the true total. So
 * we report a floor honestly rather than inventing a number: `exact` is false
 * whenever the value was repaired, and the UI says "at least N".
 *
 * Passing any filter makes the server answer correctly, which is why the
 * screens that can filter by default do.
 */
export interface RepairedPage<T> extends Paginated<T> {
  /** False when `total`/`pages` were reconstructed from the page contents. */
  exact: boolean
}

export function repairPage<T>(page: Paginated<T> | undefined): RepairedPage<T> | undefined {
  if (!page) return undefined

  const count = page.items.length
  const trustworthy = page.total >= count && !(count > 0 && page.total <= 1)
  if (trustworthy) return { ...page, exact: true }

  // A full page implies at least one more may exist; a short page is the last.
  const isFull = count >= page.page_size
  const seenSoFar = (page.page - 1) * page.page_size + count

  return {
    ...page,
    total: seenSoFar,
    pages: isFull ? page.page + 1 : page.page,
    exact: false,
  }
}
