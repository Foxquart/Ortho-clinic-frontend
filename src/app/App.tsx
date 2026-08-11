import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@radix-ui/react-tooltip'
import { queryClient } from '@/lib/query'
import { ThemeProvider } from './ThemeProvider'
import { router } from './router'

export function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={400} skipDelayDuration={300}>
          <RouterProvider router={router} />
          <Toaster
            position="bottom-right"
            offset={16}
            gap={8}
            visibleToasts={3}
            toastOptions={{
              unstyled: true,
              classNames: {
                toast:
                  'flex w-full items-start gap-3 rounded-lg border border-border bg-surface-raised px-3.5 py-3 text-body shadow-overlay',
                title: 'font-medium text-text',
                description: 'text-caption text-text-muted',
                actionButton:
                  'ml-auto rounded-md bg-accent px-2.5 py-1 text-caption font-medium text-accent-fg',
                closeButton: 'text-text-subtle hover:text-text',
              },
            }}
          />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
