/**
 * Infrastructure barrel — re-exports every primitive that lives below the
 * service layer (CSR layers: infrastructure). Nothing in this barrel may
 * import from `services/`, `repositories/`, `controllers/`, `middlewares/`,
 * or `bootstrap/`.
 */
export { create, type SDK } from './sdk/index.js'
export type {
  DriveDescriptor,
  DriveType,
  PeerInfo,
  IdentityInfo,
  HyperdriveEntry,
  TreeNode,
  ReadStream,
} from './types/dto.js'
export type { HyperdriveLike } from './types/hyperdrive.js'
export {
  HEX64,
  isHex64,
  toHexKey,
  driveKeyOf,
} from './types/key.js'
export {
  HttpProblem,
  toProblemDetails,
  PROBLEM_CONTENT_TYPE,
  httpStatusFallback,
  type ProblemDetails,
  type ProblemTypeSpec,
} from './errors/index.js'

export * from './errors/errors.const.js'