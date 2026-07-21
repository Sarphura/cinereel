/**
 * Middlewares barrel — CSR layer: HTTP plumbing (auth, error, server).
 */
export { buildServer, type BuildServerOptions } from './server.js'
export { makeAuthPreHandler, type AuthenticatedRequest } from './auth.middleware.js'
export { registerAuthMiddleware } from './register-auth.js'
export { registerErrorHandler } from './error.middleware.js'