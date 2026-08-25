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

export function RxLivePreview({ draft }: { draft: RxDraft }) {
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

  /* Never scale UP: on a very wide pane a 794px page blown up would just be
     blurry. Below A4 width it shrinks to fit. */
  const scale = frame.width > 0 ? Math.min(1, frame.width / A4_WIDTH_PX) : 1
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
        <div ref={frameRef} className="min-h-0 flex-1 overflow-hidden">
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
              height: scale > 0 ? frame.height / scale : frame.height,
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
