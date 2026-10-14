/**
 * Data layer for the patient list at ~100 patients a day.
 *
 * One endpoint, `GET /patients`, does everything: the date chips are
 * `visited_from`/`visited_to`, the search box is `q`, and the order is always
 * `last_visit desc` (never-seen patients last) so the person who just walked
 * out is at the top and the person who is about to walk in is one keystroke
 * away. Pages are 25 rows and arrive through "Load more" — the browser never
 * holds a thousand-row table.
 */

import { keepPreviousData, useInfiniteQuery, useQueries } from '@tanstack/react-query'
import { subDays } from 'date-fns'
import { apiGet } from '@/api/http'
import { endpoints, type ListPatientsParams } from '@/api/endpoints'
import { toIsoDate } from '@/lib/format'
import { qk } from '@/lib/query'
import type { Paginated, PatientListItem } from '@/api/schema'

export const FEED_PAGE_SIZE = 25

export type PatientView = 'today' | 'yesterday' | 'week' | 'all'

export const VIEWS: readonly PatientView[] = ['today', 'yesterday', 'week', 'all']

export function isPatientView(value: string | null): value is PatientView {
  return value !== null && (VIEWS as readonly string[]).includes(value)
}

/** The inclusive clinic-local date range a chip stands for. `all` has none. */
export function rangeFor(
  view: PatientView,
  now: Date = new Date(),
): Pick<ListPatientsParams, 'visited_from' | 'visited_to'> {
  const today = toIsoDate(now)
  switch (view) {
    case 'today':
      return { visited_from: today, visited_to: today }
    case 'yesterday': {
      const yesterday = toIsoDate(subDays(now, 1))
      return { visited_from: yesterday, visited_to: yesterday }
    }
    case 'week':
      // Rolling 7 days including today — the same window the API's stats use.
      return { visited_from: toIsoDate(subDays(now, 6)), visited_to: today }
    case 'all':
      return {}
  }
}

const fetchPage = (params: ListPatientsParams) =>
  apiGet<Paginated<PatientListItem>>(endpoints.patients.list, { params })

/**
 * The list itself. With `q` set the chips are ignored: typing means "find
 * this person", and the answer must not depend on which day was selected.
 */
export function usePatientFeed(view: PatientView, q: string) {
  const params: ListPatientsParams = {
    page_size: FEED_PAGE_SIZE,
    sort_by: 'last_visit',
    sort_order: 'desc',
    ...(q ? { q } : rangeFor(view)),
  }

  return useInfiniteQuery({
    // Starts with ['patients'], so creating a patient or saving a prescription
    // (which invalidate `qk.patients.all()`) refreshes the feed.
    queryKey: qk.patients.list({ feed: true, ...params }),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchPage({ ...params, page: pageParam }),
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    // Switching chip or typing must not blank the rows the doctor is reading.
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
}

/**
 * Header counts ("Today 37"): four `page_size=1` requests whose only payload
 * that matters is `total`. Cheap, cached for 30s, and invalidated together with
 * the feed whenever a prescription is saved.
 */
export function usePatientViewCounts(): Record<PatientView, number | undefined> {
  const results = useQueries({
    queries: VIEWS.map((view) => {
      const params: ListPatientsParams = { page: 1, page_size: 1, ...rangeFor(view) }
      return {
        queryKey: qk.patients.list({ count: view, ...params }),
        queryFn: () => fetchPage(params),
        select: (page: Paginated<PatientListItem>) => page.total,
        staleTime: 30_000,
      }
    }),
  })
  return {
    today: results[0].data,
    yesterday: results[1].data,
    week: results[2].data,
    all: results[3].data,
  }
}
