/**
 * Smoke test: mount a drive through the official `hyper-sdk` and verify
 * `drive.key` is a Buffer that round-trips through `Buffer#toString('hex')`.
 *
 * Replaces the equivalent self-built SDK check. Run via `tsx` or compile
 * with `tsc`.
 */
import { create as createHyperSdk } from 'hyper-sdk';
import os from 'os';
import path from 'path';

const tmpDir = path.join(os.tmpdir(), 'hy-sdk-test-' + Date.now());
const sdk = await createHyperSdk({ storage: tmpDir });
const main = await sdk.getDrive('main');
await main.ready();

console.log('drive.key:', main.key);
console.log('drive.key is Buffer:', Buffer.isBuffer(main.key));
console.log('drive.key hex:', Buffer.from(main.key).toString('hex'));

await sdk.close();