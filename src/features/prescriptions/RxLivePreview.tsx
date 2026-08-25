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
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileWarning, Loader2 } from 'lucide-react'
import { apiPost } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { toPreviewRequest, type RxDraft } from './model'

/** How long the draft must sit still before a render is asked for. */
const PREVIEW_DEBOUNCE_MS = 350

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

  const html = lastGoodHtml.current
  const pending = payload !== settled || preview.isFetching
  const failed = preview.isError && html === null

  return (
    <aside
      data-rx-preview
      aria-label="Preview of the printed prescription"
      className="bg-bg-sunken relative flex h-full flex-col overflow-hidden rounded-xl border border-border"
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
        <iframe
          title="Printed prescription preview"
          srcDoc={html}
          /* No scripts, no same-origin: the pane renders a document the client
             did not author, and it has no reason to do anything but paint. */
          sandbox=""
          className="min-h-0 w-full flex-1 border-0 bg-white"
        />
      )}
    </aside>
  )
}
