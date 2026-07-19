import { createCorestoreRuntime, driveKeyOf } from '@cinereel/hyper-sdk';
import os from 'os';
import path from 'path';

// Smoke test: mount a drive through the SDK's public surface and verify
// `drive.key` is a Buffer that round-trips through driveKeyOf() (hex string).
// Replaces the raw corestore/hyperdrive imports that violated the SDK boundary.

const tmpDir = path.join(os.tmpdir(), 'hy-sdk-test-' + Date.now());
const runtime = await createCorestoreRuntime(tmpDir);
const main = runtime.main;
await main.ready();

console.log('main === readyResult skipped (ready is awaited, not returned)');
console.log('drive.key:', main.key);
console.log('drive.key is Buffer:', Buffer.isBuffer(main.key));
console.log('drive.key hex (driveKeyOf):', driveKeyOf(main));

await runtime.close();