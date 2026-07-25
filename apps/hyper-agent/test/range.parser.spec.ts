/**
 * Ticket 11 — range.parser.spec.ts.
 *
 * Table-driven unit tests for the Range parser. The parser is the
 * single source of truth for the Range-header subset the Hyper Agent
 * accepts; ADR 0047 commits it to `bytes=A-B`, `bytes=A-`, `bytes=-N`,
 * rejecting multi-range and malformed input. The wiring tests live in
 * files.e2e-spec.ts; this file pins the parser in isolation.
 */
import { describe, it, expect } from 'vitest'
import { parseRange } from '../src/infrastructure/http/range.js'

describe('parseRange', () => {
  describe('returns `none` when no header is sent', () => {
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['empty string', ''],
    ])('header: %s', (_label, header) => {
      expect(parseRange(header, 1000)).toEqual({ kind: 'none' })
    })

    it('whitespace-only is malformed (not `none`)', () => {
      expect(parseRange('   ', 1000).kind).toBe('malformed')
    })
  })

  describe('parses single closed ranges', () => {
    it('bytes=0-499 with size 1000', () => {
      expect(parseRange('bytes=0-499', 1000)).toEqual({
        kind: 'single',
        start: 0,
        end: 499,
      })
    })

    it('bytes=500-999 with size 1000', () => {
      expect(parseRange('bytes=500-999', 1000)).toEqual({
        kind: 'single',
        start: 500,
        end: 999,
      })
    })

    it('clamps end to size-1 when client requests beyond size', () => {
      expect(parseRange('bytes=0-9999', 1000)).toEqual({
        kind: 'single',
        start: 0,
        end: 999,
      })
    })

    it('treats whitespace inside the value as malformed', () => {
      // RFC 9110 forbids whitespace inside a single range; the parser
      // rejects this with `malformed` rather than silently truncating.
      expect(parseRange('bytes= 0-499', 1000).kind).toBe('malformed')
    })

    it('rejects when start > end', () => {
      expect(parseRange('bytes=500-100', 1000).kind).toBe('malformed')
    })

    it('rejects negative start', () => {
      expect(parseRange('bytes=-1-499', 1000).kind).toBe('malformed')
    })

    it('rejects non-integer start', () => {
      expect(parseRange('bytes=abc-499', 1000).kind).toBe('malformed')
    })
  })

  describe('parses open-ended ranges', () => {
    it('bytes=500- with size 1000 covers 500..999', () => {
      expect(parseRange('bytes=500-', 1000)).toEqual({
        kind: 'single',
        start: 500,
        end: 999,
      })
    })

    it('bytes=0- with size 1000 covers 0..999', () => {
      expect(parseRange('bytes=0-', 1000)).toEqual({
        kind: 'single',
        start: 0,
        end: 999,
      })
    })

    it('returns invalid when start >= size', () => {
      expect(parseRange('bytes=1000-', 1000).kind).toBe('invalid')
    })

    it('returns invalid when size is 0', () => {
      expect(parseRange('bytes=0-', 0).kind).toBe('invalid')
    })
  })

  describe('parses suffix ranges', () => {
    it('bytes=-500 with size 1000 covers 500..999', () => {
      expect(parseRange('bytes=-500', 1000)).toEqual({
        kind: 'single',
        start: 500,
        end: 999,
      })
    })

    it('bytes=-1 with size 1000 covers 999..999', () => {
      expect(parseRange('bytes=-1', 1000)).toEqual({
        kind: 'single',
        start: 999,
        end: 999,
      })
    })

    it('bytes=-1000 with size 1000 covers 0..999', () => {
      expect(parseRange('bytes=-1000', 1000)).toEqual({
        kind: 'single',
        start: 0,
        end: 999,
      })
    })

    it('bytes=-10000 with size 1000 clamps to 0..999', () => {
      expect(parseRange('bytes=-10000', 1000)).toEqual({
        kind: 'single',
        start: 0,
        end: 999,
      })
    })

    it('returns invalid when suffix length is 0', () => {
      expect(parseRange('bytes=-0', 1000).kind).toBe('invalid')
    })

    it('returns invalid when size is 0', () => {
      expect(parseRange('bytes=-100', 0).kind).toBe('invalid')
    })
  })

  describe('rejects multi-range requests', () => {
    it('bytes=0-499,1000-1499 → multi', () => {
      expect(parseRange('bytes=0-499,1000-1499', 2000)).toEqual({ kind: 'multi' })
    })

    it('bytes=0-499,1000- with size 2000 → multi', () => {
      expect(parseRange('bytes=0-499,1000-', 2000)).toEqual({ kind: 'multi' })
    })
  })

  describe('rejects malformed input', () => {
    it.each([
      ['bare', '0-499'],
      ['empty after bytes=', 'bytes='],
      ['only whitespace after bytes=', 'bytes=   '],
      ['missing dash', 'bytes=499'],
      ['start is not a number', 'bytes=abc-499'],
      ['end is not a number', 'bytes=0-abc'],
      ['negative end', 'bytes=0--1'],
      ['empty range set', 'bytes=,'],
      ['huge range set', 'bytes=,,,,,,'],
    ])('header: %s', (_label, header) => {
      expect(parseRange(header, 1000).kind).toBe('malformed')
    })
  })
})
