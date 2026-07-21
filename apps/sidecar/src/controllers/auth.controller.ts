/**
 * AuthController — POST /v1/auth/token.
 *
 * Exchanges an API key for a short-lived JWT. The auth middleware
 * deliberately does not apply preHandler logic to this path (the auth
 * logic IS the handler).
 */
import type { FastifyInstance } from 'fastify'
import { verifyApiKey, getSigningSecret } from '../auth/keys.js'
import { signJwt } from '../auth/jwt.js'

export const JWT_EXPIRY_SECONDS = 15 * 60 // 15 minutes

export class AuthController {
  register(app: FastifyInstance): void {
    app.post('/v1/auth/token', {
      schema: {
        body: {
          type: 'object',
          required: ['apiKey'],
          properties: {
            apiKey: { type: 'string', minLength: 1 },
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['token', 'expiresIn'],
            properties: {
              token: { type: 'string' },
              expiresIn: { type: 'integer' },
              tokenType: { type: 'string', enum: ['Bearer'] },
            },
          },
        },
      },
    }, async (req, reply) => {
      const { apiKey } = req.body as { apiKey: string }

      const kid = verifyApiKey(apiKey)
      if (!kid) {
        // @ts-ignore — Fastify v5 strict reply typing; 401 is intentional here
        return reply.code(401).send({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Invalid API key',
          },
        })
      }

      const secret = getSigningSecret(kid)
      if (!secret) {
        // @ts-ignore — Fastify v5 strict reply typing; 500 is intentional here
        return reply.code(500).send({
          error: {
            code: 'INTERNAL',
            message: 'Signing key not found',
          },
        })
      }

      const token = signJwt({ sub: kid }, secret, JWT_EXPIRY_SECONDS)
      return { token, expiresIn: JWT_EXPIRY_SECONDS, tokenType: 'Bearer' as const }
    })
  }
}