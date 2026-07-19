import type { Drive } from '../types/hyperdrive.js';

const DRIVE_KEY_RE = /^[0-9a-f]{64}$/;

export interface NormalizedDriveKey {
  hex: string;
  buffer: Buffer;
}

export class InvalidDriveKeyError extends Error {
  constructor(public readonly provided: string) {
    super(`Invalid drive key: ${provided}`);
    this.name = 'InvalidDriveKeyError';
  }
}

export function normalizeAndValidateDriveKey(input: string): NormalizedDriveKey {
  const hex = input.toLowerCase().replace(/^0x/, '');
  if (!DRIVE_KEY_RE.test(hex)) {
    throw new InvalidDriveKeyError(input);
  }
  return { hex, buffer: Buffer.from(hex, 'hex') };
}

export function driveKeyOf(drive: Drive): string {
  return drive.key.toString('hex');
}