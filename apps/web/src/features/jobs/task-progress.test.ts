import { describe, expect, it } from 'vitest';
import { normalizeTaskProgress, taskProgressToDash } from './task-progress';

describe('task progress', () => {
  it('treats API progress values as percentages', () => {
    expect(normalizeTaskProgress(18)).toBe(18);
    expect(normalizeTaskProgress(60)).toBe(60);
    expect(taskProgressToDash(50, 75.4)).toBeCloseTo(37.7);
  });

  it('clamps invalid progress values', () => {
    expect(normalizeTaskProgress(-1)).toBe(0);
    expect(normalizeTaskProgress(180)).toBe(100);
    expect(normalizeTaskProgress(Number.NaN)).toBe(0);
  });
});
