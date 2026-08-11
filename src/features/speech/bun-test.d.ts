/**
 * Minimal ambient types for `bun:test`.
 *
 * The repo does not depend on `@types/bun` — adding it would pull Bun's whole
 * global surface into an app that runs in a browser. The test runner only ever
 * needs these four symbols, so they are declared here and nowhere else.
 */
declare module 'bun:test' {
  export function describe(label: string, body: () => void): void
  export function test(label: string, body: () => void | Promise<void>): void
  export function it(label: string, body: () => void | Promise<void>): void

  export interface Expectation<T> {
    toBe(expected: T): void
    toEqual(expected: unknown): void
    toBeNull(): void
    toBeTruthy(): void
    toBeFalsy(): void
    toContain(expected: unknown): void
    toHaveLength(expected: number): void
    toBeGreaterThan(expected: number): void
    toMatch(expected: RegExp | string): void
    readonly not: Expectation<T>
  }

  export function expect<T>(actual: T): Expectation<T>
}
