/**
 * The printed page, live, beside the pad.
 *
 * ## Why this asks the server instead of drawing it here
 *
 * The first version of this component was a hand-written reproduction of the
 * print template. It was accurate the day it shipped and wrong a week later,
 * because the template is maintained in another repository and changed — the
 * medicines block moved, a pre-printed checklist appeared, the page went full
 * width. A preview that lies about what will print is worse than no preview at
 * all: it is the one screen a doctor trusts to check a prescription before
 * handing it to a patient.
 *
 * So this posts the draft to `POST /prescriptions/preview` and renders the
 * HTML that comes back. That endpoint runs the same Jinja template as the real
 * print, with a test asserting the two produce matching markers, so the two can
 * no longer drift. It writes nothing: no prescription number is allocated, no
 * audit row is written, nothing is committed, and the number prints as `DRAFT`.
 *
 * ## Why a debounce is not a compile button
 *
 * The pad's promise was "like a LaTeX preview, but you never press compile".
 * A request per keystroke would be absurd, so the draft settles for
 * {@link PREVIEW_DEBOUNCE_MS} before it is sent. The doctor still never asks
 * for a render; it simply arrives a moment after they stop typing. The
 * previous page stays on screen while the next one is in flight, so the pane
 * never blanks — it goes quietly stale and then updates.
 *
 * ## Why an iframe
 *
 * The returned document carries its own `<style>`, sized in millimetres for
 * A4. Injecting that into the app's DOM would leak page styling into the pad
 * and inherit the app's own cascade into the page. `srcdoc` on a sandboxed
 * iframe gives it a separate document with no scripts and no same-origin
 * access, which is also the right posture for HTML the client did not author.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileWarning, Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { apiPost } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { toPreviewRequest, type RxDraft } from './model'

/** How long the draft must sit still before a render is asked for. */
const PREVIEW_DEBOUNCE_MS = 350

/**
 * A4 width in CSS pixels — 210mm at the 96dpi the template is laid out for.
 *
 * The page is a fixed physical width; the pane beside the pad is whatever the
 * viewport leaves over. Rather than let the page be cut off at the right edge
 * (which hides the Instructions column and half the diet panel), the iframe is
 * rendered at true A4 width and scaled down to fit. A print preview that crops
 * the page is not showing you what prints.
 */
const A4_WIDTH_PX = 794

/**
 * A4 height in CSS pixels — 297mm at 96dpi.
 *
 * Only used at 1:1 zoom, where the pane can no longer tell us how tall the
 * document is (the frame is sandboxed to an opaque origin, so its scroll
 * height is unreadable). One page is the honest floor: a prescription that
 * runs longer keeps scrolling inside the frame, exactly as it does today when
 * the pane is shorter than the page.
 */
const A4_HEIGHT_PX = 1123

const ZOOMS = [
  { value: 'fit', label: 'Fit' },
  { value: 'actual', label: 'Actual size' },
] as const

interface PreviewResponse {
  html: string
}

/**
 * Debounces to a settled copy of the value. The preview's request key is built
 * from this, so a burst of typing produces one render rather than one per
 * character.
 */
function useSettled<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])

  return settled
}

/** Tracks a element's box, so the page can be scaled to whatever width it gets. */
function useBoxSize(): [(node: HTMLDivElement | null) => void, { width: number; height: number }] {
  const [box, setBox] = useState({ width: 0, height: 0 })
  const observer = useRef<ResizeObserver | null>(null)

  const ref = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect()
    if (!node) return
    observer.current = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setBox({ width, height })
    })
    observer.current.observe(node)
  }, [])

  useEffect(() => () => observer.current?.disconnect(), [])

  return [ref, box]
}

export function RxLivePreview({
  draft,
  zoomable = false,
}: {
  draft: RxDraft
  /**
   * Offer a 1:1 zoom alongside fit-to-width.
   *
   * Beside the pad on a laptop the pane is ~700px and fit-to-width lands near
   * 90% — legible, so there is nothing to offer and the header stays as it
   * was. Opened as a sheet on a phone the same fit is around 40%, which is
   * enough to check that the page *looks* right and nowhere near enough to
   * read a dose off it. So the small screen — and only the small screen — gets
   * a second gear: true A4, panned inside the pane rather than clipped by it.
   */
  zoomable?: boolean
}) {
  /* The payload is the query key. Serialising it here means React Query
     re-fetches exactly when the *content* changed, and not when an unrelated
     re-render produced an equal-but-new object. */
  const payload = JSON.stringify(toPreviewRequest(draft))
  const settled = useSettled(payload, PREVIEW_DEBOUNCE_MS)

  const preview = useQuery({
    queryKey: ['prescription-preview', settled],
    queryFn: () =>
      apiPost<PreviewResponse>(endpoints.prescriptions.preview, JSON.parse(settled) as unknown),
    /* Keeping the last page on screen is the whole reason the pane does not
       flicker: `placeholderData` hands back the previous result while the next
       render is in flight. */
    placeholderData: (previous) => previous,
    staleTime: Infinity,
    retry: 1,
  })

  /* A render already on screen must never be replaced by an error. If the
     network drops mid-consultation the doctor keeps the last good page, marked
     stale, rather than losing the preview entirely. */
  const lastGoodHtml = useRef<string | null>(null)
  if (preview.data?.html) lastGoodHtml.current = preview.data.html

  const [frameRef, frame] = useBoxSize()
  const html = lastGoodHtml.current

  const [zoom, setZoom] = useState<'fit' | 'actual'>('fit')

  /* Never scale UP: on a very wide pane a 794px page blown up would just be
     blurry. Below A4 width it shrinks to fit. */
  const fitScale = frame.width > 0 ? Math.min(1, frame.width / A4_WIDTH_PX) : 1
  const scale = zoomable && zoom === 'actual' ? 1 : fitScale
  const pending = payload !== settled || preview.isFetching
  const failed = preview.isError && html === null

  return (
    <aside
      data-rx-preview
      aria-label="Preview of the printed prescription"
      className="bg-bg-sunken relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-border"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-micro uppercase text-text-muted">Prints as</span>
        {pending && (
          <Loader2
            aria-label="Updating preview"
            className="size-3.5 animate-spin text-text-subtle motion-reduce:animate-none"
          />
        )}

        {zoomable && (
          <div
            role="group"
            aria-label="Preview zoom"
            className="ml-auto flex items-center gap-1"
          >
            {ZOOMS.map((option) => {
              const active = zoom === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setZoom(option.value)}
                  className={cn(
                    'inline-flex min-h-tap items-center rounded-md border px-3 text-label',
                    'transition-colors duration-instant ease-standard',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35',
                    active
                      ? 'border-accent/40 bg-accent-muted text-accent-muted-fg'
                      : 'border-border bg-surface text-text-muted hover:border-accent',
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        )}
      </header>

      {failed ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <FileWarning aria-hidden className="size-5 text-text-subtle" />
          <p className="text-label text-text">The preview could not be rendered.</p>
          <p className="text-caption text-text-muted">
            The prescription itself is unaffected — this pane only shows what would print.
          </p>
        </div>
      ) : html === null ? (
        /* First load. Deliberately not a skeleton of the page: a fake
           prescription shape is exactly the kind of thing that gets mistaken
           for the real one at a glance. */
        <div className="flex flex-1 items-center justify-center p-6">
          <Loader2
            aria-label="Loading preview"
            className="size-5 animate-spin text-text-subtle motion-reduce:animate-none"
          />
        </div>
      ) : (
        <div
          ref={frameRef}
          /* At 1:1 the page is wider than the pane on purpose, so the pane
             itself is what scrolls — `overscroll-contain` keeps that gesture
             from turning into a page-level swipe once it reaches the edge.
             The overflow is contained here and never reaches the document,
             which is the difference between "pan the preview" and "the whole
             screen is 400px too wide". */
          className={cn(
            'min-h-0 flex-1',
            scale < 1 || !zoomable ? 'overflow-hidden' : 'overflow-auto overscroll-contain',
          )}
        >
          <iframe
            title="Printed prescription preview"
            srcDoc={html}
            /* No scripts, no same-origin: the pane renders a document the
               client did not author, and it has no reason to do anything but
               paint. */
            sandbox=""
            /* Laid out at true A4 width and scaled to fit, so the page is
               never cropped. The height is divided by the same factor, so
               after scaling it fills the pane exactly and long prescriptions
               scroll inside the frame rather than being cut off. */
            style={{
              width: A4_WIDTH_PX,
              height:
                scale < 1
                  ? frame.height / scale
                  : /* At 1:1 the pane can no longer imply a page height, so a
                       full A4 is the floor and the wrapper scrolls to it. */
                    Math.max(frame.height, A4_HEIGHT_PX),
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
            className="border-0 bg-white"
          />
        </div>
      )}
    </aside>
  )
}
