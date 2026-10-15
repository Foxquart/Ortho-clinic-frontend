import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { CheckCheck, Languages, Plus, Search } from 'lucide-react'
import { toApiError, errorMessage } from '@/api/errors'
import { cn } from '@/lib/cn'
import { tweenBase } from '@/lib/motion'
import { Button } from '@/components/ui/Button'
import { Kbd } from '@/components/ui/Badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Controls'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, PageHeader } from '@/components/ui/Surface'
import type { BengaliPhraseResponse, MissingPhrase } from '@/api/schema'
import {
  useCreatePhrase,
  useDeletePhrase,
  useMissingPhrases,
  usePhraseList,
  useUpdatePhrase,
} from './usePhrases'

/* Fingertip-sized fields below `sm`; the original density above it. */
const TOUCH_FIELDS = 'max-sm:[&_input]:min-h-tap'

const BN_PLACEHOLDER = 'বাংলায় লিখুন'

/** Enter while an IME is still composing commits the word, not the row. */
function isPlainEnter(event: KeyboardEvent): boolean {
  return event.key === 'Enter' && !event.nativeEvent.isComposing && !event.shiftKey
}

/* -------------------------------------------------------------------------- */
/*  Missing                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The work queue: lines that printed without Bengali, most used first.
 *
 * Built to be worked through from the keyboard without looking away from the
 * line: Enter saves and is already on the next row before the request returns;
 * the saved row slides out at once. A failed save puts the row back with what
 * was typed still in it.
 *
 * Drafts live in a ref, not state: typing re-renders nothing, and a row that
 * leaves and comes back (failed save) keeps its text.
 */
function MissingTab() {
  const view = useMissingPhrases()
  const create = useCreatePhrase()
  const drafts = useRef(new Map<string, string>())
  const inputs = useRef(new Map<string, HTMLInputElement>())
  const focusedFirst = useRef(false)
  // Saved, or on its way: hidden immediately, restored only if the save fails.
  const [done, setDone] = useState<ReadonlySet<string>>(new Set())

  const rows = useMemo(
    () => (view.data ?? []).filter((row) => !done.has(row.english)),
    [view.data, done],
  )

  useEffect(() => {
    if (focusedFirst.current || rows.length === 0) return
    focusedFirst.current = true
    inputs.current.get(rows[0].english)?.focus()
  }, [rows])

  const focusRow = (index: number) => inputs.current.get(rows[index]?.english ?? '')?.focus()

  const setHidden = (english: string, hidden: boolean) =>
    setDone((prev) => {
      const next = new Set(prev)
      if (hidden) next.add(english)
      else next.delete(english)
      return next
    })

  const save = (row: MissingPhrase, index: number) => {
    const bengali = (drafts.current.get(row.english) ?? '').trim()
    const nextIndex = index + 1 < rows.length ? index + 1 : index - 1
    if (bengali === '') {
      // Nothing typed: Enter just moves on, so a line can be skipped.
      focusRow(index + 1)
      return
    }
    setHidden(row.english, true)
    focusRow(nextIndex)
    // mutateAsync, not mutate: per-call callbacks of `mutate` only fire for the
    // latest call, and rapid saves overlap.
    create.mutateAsync({ english: row.english, bengali }).catch((error: unknown) => {
      if (toApiError(error).isConflict) {
        toast.info('Someone just added Bengali for that line')
        return
      }
      setHidden(row.english, false)
      toast.error(errorMessage(error))
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, row: MissingPhrase, index: number) => {
    if (isPlainEnter(event)) {
      event.preventDefault()
      save(row, index)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusRow(index + (event.key === 'ArrowDown' ? 1 : -1))
    }
  }

  if (view.isPending) {
    return (
      <Card>
        <SkeletonRows rows={6} className="py-2" />
      </Card>
    )
  }
  if (view.isError) return <ErrorState error={view.error} onRetry={() => void view.refetch()} />

  return (
    <Card>
      <CardHeader
        title="Printed without Bengali"
        description={
          <>
            Most used first, from the last six months. <Kbd>Enter</Kbd> saves and moves to the next
            line, <Kbd>Enter</Kbd> on an empty field skips it.
          </>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<CheckCheck />}
          title="Every recent line has its Bengali"
          description="New lines show up here as soon as a prescription prints them without one."
        />
      ) : (
        <ul className={TOUCH_FIELDS}>
          <AnimatePresence initial={false}>
            {rows.map((row, index) => (
              <motion.li
                key={row.english}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, x: 24, height: 0, transition: tweenBase }}
                className="border-border overflow-hidden border-b last:border-b-0"
              >
                <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-body text-text break-words">{row.english}</p>
                    <p className="text-caption text-text-subtle" data-numeric>
                      {row.uses === 1 ? '1 use' : `${row.uses.toLocaleString()} uses`}
                    </p>
                  </div>
                  <Input
                    ref={(el) => {
                      if (el) inputs.current.set(row.english, el)
                      else inputs.current.delete(row.english)
                    }}
                    lang="bn"
                    aria-label={`Bengali for: ${row.english}`}
                    placeholder={BN_PLACEHOLDER}
                    maxLength={1024}
                    autoComplete="off"
                    defaultValue={drafts.current.get(row.english) ?? ''}
                    onChange={(e) => drafts.current.set(row.english, e.target.value)}
                    onKeyDown={(e) => onKeyDown(e, row, index)}
                  />
                  <Button
                    variant="tonal"
                    size="sm"
                    className="min-h-tap sm:min-h-0"
                    onClick={() => save(row, index)}
                  >
                    Save
                  </Button>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/*  All phrases                                                               */
/* -------------------------------------------------------------------------- */

/** Beyond this many matches, ask for a narrower search rather than render thousands of inputs-in-waiting. */
const RENDER_CAP = 200

function conflictOr(error: unknown): string {
  const apiError = toApiError(error)
  return apiError.isConflict ? 'That English line is already in the phrasebook.' : apiError.message
}

function AddPhrase() {
  const create = useCreatePhrase()
  const englishRef = useRef<HTMLInputElement>(null)
  const [english, setEnglish] = useState('')
  const [bengali, setBengali] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const body = { english: english.trim(), bengali: bengali.trim() }
    if (!body.english || !body.bengali) {
      setError('Enter both the English line and its Bengali.')
      return
    }
    setError(null)
    create.mutate(body, {
      onSuccess: () => {
        toast.success('Phrase added')
        setEnglish('')
        setBengali('')
        englishRef.current?.focus()
      },
      onError: (e) => setError(conflictOr(e)),
    })
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className={cn('border-border border-b px-4 py-3', TOUCH_FIELDS)}
    >
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
        <Input
          ref={englishRef}
          aria-label="English line"
          placeholder="English line, e.g. Hot fomentation twice daily"
          maxLength={512}
          autoComplete="off"
          value={english}
          onChange={(e) => setEnglish(e.target.value)}
        />
        <Input
          lang="bn"
          aria-label="Bengali"
          placeholder={BN_PLACEHOLDER}
          maxLength={1024}
          autoComplete="off"
          value={bengali}
          onChange={(e) => setBengali(e.target.value)}
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          className="min-h-tap sm:min-h-0"
          iconLeft={<Plus className="size-4" />}
          loading={create.isPending}
        >
          Add
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-caption text-danger mt-2">
          {error}
        </p>
      )}
    </form>
  )
}

function EditPhraseRow({ phrase, onDone }: { phrase: BengaliPhraseResponse; onDone: () => void }) {
  const update = useUpdatePhrase()
  const [english, setEnglish] = useState(phrase.english)
  const [bengali, setBengali] = useState(phrase.bengali)
  const [error, setError] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const body = { english: english.trim(), bengali: bengali.trim() }
    if (!body.english || !body.bengali) {
      setError('Both fields are needed.')
      return
    }
    if (body.english === phrase.english && body.bengali === phrase.bengali) {
      onDone()
      return
    }
    update.mutate(
      { id: phrase.id, body },
      {
        onSuccess: () => {
          toast.success('Phrase updated')
          onDone()
        },
        onError: (e) => setError(conflictOr(e)),
      },
    )
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      onKeyDown={(e) => e.key === 'Escape' && onDone()}
      className={cn('px-4 py-3', TOUCH_FIELDS)}
    >
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
        <Input
          autoFocus
          aria-label="English line"
          maxLength={512}
          autoComplete="off"
          value={english}
          onChange={(e) => setEnglish(e.target.value)}
        />
        <Input
          lang="bn"
          aria-label="Bengali"
          maxLength={1024}
          autoComplete="off"
          value={bengali}
          onChange={(e) => setBengali(e.target.value)}
        />
        <span className="flex items-center gap-1">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            className="min-h-tap sm:min-h-0"
            loading={update.isPending}
          >
            Save
          </Button>
          <Button variant="ghost" size="sm" className="min-h-tap sm:min-h-0" onClick={onDone}>
            Cancel
          </Button>
        </span>
      </div>
      {error && (
        <p role="alert" className="text-caption text-danger mt-2">
          {error}
        </p>
      )}
    </form>
  )
}

function PhraseRow({
  phrase,
  onDelete,
}: {
  phrase: BengaliPhraseResponse
  onDelete: (phrase: BengaliPhraseResponse) => void
}) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <li className="border-border border-b last:border-b-0">
        <EditPhraseRow phrase={phrase} onDone={() => setEditing(false)} />
      </li>
    )
  }
  return (
    <li className="border-border grid gap-x-4 gap-y-1 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
      <p className="text-body text-text min-w-0 break-words">{phrase.english}</p>
      <p lang="bn" className="text-body text-text min-w-0 break-words">
        {phrase.bengali}
      </p>
      <span className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="min-h-tap sm:min-h-0"
          aria-label={`Edit phrase: ${phrase.english}`}
          onClick={() => setEditing(true)}
        >
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-danger hover:bg-danger-muted hover:text-danger min-h-tap sm:min-h-0"
          aria-label={`Delete phrase: ${phrase.english}`}
          onClick={() => onDelete(phrase)}
        >
          Delete
        </Button>
      </span>
    </li>
  )
}

function AllTab() {
  const view = usePhraseList()
  const remove = useDeletePhrase()
  const [query, setQuery] = useState('')
  const [deleting, setDeleting] = useState<BengaliPhraseResponse | null>(null)
  // Held so the dialog keeps its text through its exit animation.
  const [deletingText, setDeletingText] = useState('')

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const all = view.data ?? []
    if (!needle) return all
    return all.filter(
      (p) => p.english.toLowerCase().includes(needle) || p.bengali.toLowerCase().includes(needle),
    )
  }, [view.data, query])

  const confirmDelete = () => {
    if (!deleting) return
    remove.mutate(deleting.id, {
      onSuccess: () => {
        setDeleting(null)
        toast.success('Phrase deleted')
      },
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  if (view.isPending) {
    return (
      <Card>
        <SkeletonRows rows={6} className="py-2" />
      </Card>
    )
  }
  if (view.isError) return <ErrorState error={view.error} onRetry={() => void view.refetch()} />

  return (
    <Card>
      <AddPhrase />
      <div className={cn('border-border border-b px-4 py-3', TOUCH_FIELDS)}>
        <Input
          type="search"
          aria-label="Search phrases"
          placeholder="Search English or Bengali"
          iconLeft={<Search />}
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {matches.length === 0 ? (
        <EmptyState
          icon={<Languages />}
          title={query.trim() ? 'No phrase matches' : 'The phrasebook is empty'}
          description={
            query.trim()
              ? 'Add it above and it prints from the next prescription.'
              : 'Add a line above, or work through the Missing tab.'
          }
        />
      ) : (
        <ul>
          {matches.slice(0, RENDER_CAP).map((phrase) => (
            <PhraseRow
              key={phrase.id}
              phrase={phrase}
              onDelete={(p) => {
                setDeletingText(p.english)
                setDeleting(p)
              }}
            />
          ))}
        </ul>
      )}
      {matches.length > RENDER_CAP && (
        <p role="status" className="text-caption text-text-muted border-border border-t px-4 py-3">
          Showing the first {RENDER_CAP} of {matches.length.toLocaleString()}. Search to narrow it
          down.
        </p>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this phrase?"
        body={
          <>
            <p className="text-text">&ldquo;{deletingText}&rdquo;</p>
            <p className="mt-2">
              It will print in English only, and show up under Missing again while prescriptions
              keep using it.
            </p>
          </>
        }
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/*  Screen                                                                    */
/* -------------------------------------------------------------------------- */

export function PhrasebookScreen() {
  const [tab, setTab] = useState('missing')
  const all = usePhraseList()

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        title="Bengali phrases"
        description="The Bengali printed in brackets after each English line. Add a line once and it prints on every prescription from then on."
      />
      <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="missing">Missing</TabsTrigger>
          <TabsTrigger value="all" count={all.data?.length}>
            All phrases
          </TabsTrigger>
        </TabsList>
        <TabsContent value="missing">
          <MissingTab />
        </TabsContent>
        <TabsContent value="all">
          <AllTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
