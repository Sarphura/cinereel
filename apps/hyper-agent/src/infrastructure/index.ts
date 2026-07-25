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
  ErrorCode,
  SidecarError,
  toErrorBody,
  httpStatusFor,
  type ErrorCodeValue,
  type SidecarErrorBody,
} from './errors/index.js'