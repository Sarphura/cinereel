import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config/index.js';

describe('config env isolation', () => {
  it('uses SIDECAR_PORT when set', () => {
    const cfg = loadConfig({
      SIDECAR_PORT: '4322',
    } as NodeJS.ProcessEnv);
    expect(cfg.port).toBe(4322);
  });

  it('falls back to default 4321 when SIDECAR_PORT is unset', () => {
    const env = { ...process.env } as NodeJS.ProcessEnv;
    delete env.SIDECAR_PORT;
    const cfg = loadConfig(env);
    expect(cfg.port).toBe(4321);
  });

  it('uses SIDECAR_STORE_DIR when set', () => {
    const cfg = loadConfig({
      SIDECAR_STORE_DIR: './.peer-sidecar-store',
    } as NodeJS.ProcessEnv);
    expect(cfg.storeDir).toBe('./.peer-sidecar-store');
  });

  it('falls back to default storeDir when SIDECAR_STORE_DIR is unset', () => {
    const env = { ...process.env } as NodeJS.ProcessEnv;
    delete env.SIDECAR_STORE_DIR;
    const cfg = loadConfig(env);
    expect(cfg.storeDir).toBe('./.sidecar-store');
  });
});