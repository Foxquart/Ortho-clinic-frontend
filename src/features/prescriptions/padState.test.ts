import { describe, expect, test } from 'bun:test'
import { newClientRequestId } from './padState'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newClientRequestId', () => {
  test('is a fresh v4 uuid each time', () => {
    const [a, b] = [newClientRequestId(), newClientRequestId()]
    expect(a).toMatch(UUID)
    expect(a).not.toBe(b)
  })

  test('still works where randomUUID is unavailable (insecure context)', () => {
    const original = crypto.randomUUID
    // @ts-expect-error simulating plain http, where the method is missing
    crypto.randomUUID = undefined
    try {
      const [a, b] = [newClientRequestId(), newClientRequestId()]
      expect(a).toMatch(UUID)
      expect(a).not.toBe(b)
    } finally {
      crypto.randomUUID = original
    }
  })
})
