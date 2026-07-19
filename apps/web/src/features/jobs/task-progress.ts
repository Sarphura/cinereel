export function normalizeTaskProgress(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0;
  }

  return Math.max(0, Math.min(progress, 100));
}

export function taskProgressToDash(progress: number, circumference: number): number {
  return (normalizeTaskProgress(progress) / 100) * circumference;
}
