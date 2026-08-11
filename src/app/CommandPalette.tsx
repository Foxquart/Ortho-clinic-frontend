import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as RD from '@radix-ui/react-dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { Command } from 'cmdk'
import { Loader2, Plus, Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { qk } from '@/lib/query'
import { cn } from '@/lib/cn'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { Kbd } from '@/components/ui/Badge'
import { useAuth } from './AuthProvider'
import { DEMOTED_NAV, PRESCRIBE_ACTIONS, PRIMARY_NAV, SECONDARY_NAV } from './navigation'
import type { MedicineResponse, PatientSearchResult } from '@/api/schema'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ITEM_CLASS = cn(
  'flex cursor-default select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-body outline-none',
  'data-[selected=true]:bg-accent-muted',
  '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-text-subtle',
)

/* Item values are ids, not labels: cmdk keeps its highlight on whichever value
   still exists, so they have to be built the same way everywhere. */
const actionValue = (label: string) => `action:${label}`
const patientValue = (id: string) => `patient:${id}`
const medicineValue = (id: string) => `medicine:${id}`

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { can } = useAuth()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  const debounced = useDebouncedValue(query.trim(), 180)
  const searching = debounced.length >= 2

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const patients = useQuery({
    queryKey: qk.patients.search(debounced),
    queryFn: () =>
      apiGet<PatientSearchResult[]>('/patients/search', {
        params: { q: debounced, limit: 6 },
      }),
    enabled: open && searching,
    staleTime: 20_000,
  })

  const medicines = useQuery({
    queryKey: qk.medicines.search(debounced),
    queryFn: () =>
      apiGet<MedicineResponse[]>('/medicines/search', {
        params: { q: debounced, limit: 6 },
      }),
    enabled: open && searching,
    staleTime: 20_000,
  })

  const navItems = useMemo(
    () => [...PRIMARY_NAV, ...SECONDARY_NAV].filter((i) => !i.requires || can(i.requires)),
    [can],
  )

  /* Demoted screens are still one search away — they just sit under everything
     the doctor actually reaches for. */
  const moreItems = useMemo(() => DEMOTED_NAV.filter((i) => !i.requires || can(i.requires)), [can])

  const prescribeActions = useMemo(
    () => PRESCRIBE_ACTIONS.filter((a) => !a.requires || can(a.requires)),
    [can],
  )

  const go = (to: string) => {
    onOpenChange(false)
    navigate(to)
  }

  const loading = patients.isFetching || medicines.isFetching

  /**
   * What Enter does right now.
   *
   * cmdk holds its highlight on whichever value still exists, and results
   * arrive a beat after the keystroke that asked for them — so left alone the
   * highlight stays parked on "Dictate" while the patient the doctor searched
   * for sits above it, and Enter fires the wrong thing. Naming the top row
   * explicitly makes the answer to "what will Enter do" the same as the answer
   * to "what is at the top", which is the only answer anyone expects.
   */
  const topValue = searching
    ? patients.data?.[0]
      ? patientValue(patients.data[0].id)
      : medicines.data?.[0]
        ? medicineValue(medicines.data[0].id)
        : prescribeActions[0]
          ? actionValue(prescribeActions[0].label)
          : ''
    : prescribeActions[0]
      ? actionValue(prescribeActions[0].label)
      : ''

  useEffect(() => {
    setSelected(topValue)
  }, [topValue])

  /**
   * The prescribing actions open the palette; they are what ⌘K is for. But once
   * the doctor has typed a name, cmdk highlights the first row and Enter fires
   * it — so while searching, the matches come first and the actions drop below
   * them. Nobody types "sharma" and means "new prescription".
   */
  const actionsGroup = (
    <Command.Group
      heading="Prescribe"
      className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-text-subtle"
    >
      {prescribeActions.map((action) => {
        const Icon = action.icon
        return (
          <Command.Item
            key={action.to}
            value={actionValue(action.label)}
            onSelect={() => go(action.to)}
            className={ITEM_CLASS}
          >
            <Icon aria-hidden />
            <span className="flex-1">{action.label}</span>
            {action.goKey ? (
              <span className="flex shrink-0 items-center gap-0.5">
                <Kbd>g</Kbd>
                <Kbd>{action.goKey}</Kbd>
              </span>
            ) : (
              <span className="shrink-0 text-caption text-text-subtle">{action.hint}</span>
            )}
          </Command.Item>
        )
      })}
      {can('patients.write') && (
        <Command.Item
          value={actionValue('New patient')}
          onSelect={() => go('/patients?new=1')}
          className={ITEM_CLASS}
        >
          <Plus aria-hidden />
          <span className="flex-1">New patient</span>
        </Command.Item>
      )}
    </Command.Group>
  )

  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-[fade-in_140ms_var(--ease-standard)]" />
        <RD.Content
          className={cn(
            'fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2',
            'overflow-hidden rounded-xl border border-border bg-surface shadow-overlay',
            'data-[state=open]:animate-[dialog-in_180ms_var(--ease-out-quint)]',
          )}
        >
          <VisuallyHidden>
            <RD.Title>Command palette</RD.Title>
            <RD.Description>Search patients and medicines, or jump to a screen</RD.Description>
          </VisuallyHidden>

          {/* Server ranks the results; local filtering would fight it. */}
          <Command
            shouldFilter={false}
            loop
            value={selected}
            onValueChange={setSelected}
          >
            <div className="flex items-center gap-2.5 border-b border-border px-3.5">
              <Search aria-hidden className="size-4 shrink-0 text-text-subtle" />
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Search patients, medicines, or jump to…"
                className="h-11 w-full bg-transparent text-body outline-none placeholder:text-text-subtle"
              />
              {loading && (
                <Loader2
                  aria-hidden
                  className="size-4 shrink-0 animate-spin text-text-subtle motion-reduce:animate-none"
                />
              )}
              <Kbd className="hidden sm:inline-flex">esc</Kbd>
            </div>

            <Command.List className="scrollbar-subtle max-h-[52vh] overflow-y-auto p-1.5">
              {searching && !loading && !patients.data?.length && !medicines.data?.length && (
                <Command.Empty className="px-3 py-8 text-center text-caption text-text-muted">
                  Nothing matches “{debounced}”.
                </Command.Empty>
              )}

              {!searching && actionsGroup}

              {patients.data && patients.data.length > 0 && (
                <Command.Group
                  heading="Patients"
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-text-subtle"
                >
                  {patients.data.map((p) => (
                    <Command.Item
                      key={p.id}
                      value={patientValue(p.id)}
                      onSelect={() => go(`/patients/${p.id}`)}
                      className={ITEM_CLASS}
                    >
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-raised text-[10px] font-semibold text-text-muted">
                        {(p.first_name?.[0] ?? '') + (p.last_name?.[0] ?? '')}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {p.first_name} {p.last_name}
                      </span>
                      <span className="shrink-0 font-mono text-caption text-text-subtle">
                        {p.phone}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {medicines.data && medicines.data.length > 0 && (
                <Command.Group
                  heading="Medicines"
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-text-subtle"
                >
                  {medicines.data.map((m) => (
                    <Command.Item
                      key={m.id}
                      value={medicineValue(m.id)}
                      onSelect={() => go(`/medicines?highlight=${m.id}`)}
                      className={ITEM_CLASS}
                    >
                      <span className="min-w-0 flex-1 truncate">{m.name}</span>
                      {m.strength && (
                        <span className="shrink-0 text-caption text-text-subtle">{m.strength}</span>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {searching && actionsGroup}

              <Command.Group
                heading="Go to"
                className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-text-subtle"
              >
                {navItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <Command.Item
                      key={item.to}
                      value={`nav-${item.label}`}
                      onSelect={() => go(item.to)}
                      className={ITEM_CLASS}
                    >
                      <Icon aria-hidden />
                      <span className="flex-1">{item.label}</span>
                      <span className="flex shrink-0 items-center gap-0.5">
                        <Kbd>g</Kbd>
                        <Kbd>{item.goKey}</Kbd>
                      </span>
                    </Command.Item>
                  )
                })}
              </Command.Group>

              {moreItems.length > 0 && (
                <Command.Group
                  heading="More"
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-text-subtle"
                >
                  {moreItems.map((item) => {
                    const Icon = item.icon
                    return (
                      <Command.Item
                        key={item.to}
                        value={`more-${item.label}`}
                        onSelect={() => go(item.to)}
                        className={ITEM_CLASS}
                      >
                        <Icon aria-hidden />
                        <span className="flex-1">{item.label}</span>
                        <span className="flex shrink-0 items-center gap-0.5">
                          <Kbd>g</Kbd>
                          <Kbd>{item.goKey}</Kbd>
                        </span>
                      </Command.Item>
                    )
                  })}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}
