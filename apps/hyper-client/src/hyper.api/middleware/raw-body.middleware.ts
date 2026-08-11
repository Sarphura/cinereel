/**
 * Raw body capture — Express middleware exports a Symbol key under which
 * `express.raw()` places the Buffer. The `@RawBody()` decorator reads
 * from this key.
 */
export const RAW_BODY_KEY = Symbol('rawBody')
