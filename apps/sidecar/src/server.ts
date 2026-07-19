import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { Config } from './config.js';
import { makeAuthPreHandler } from './auth/token-hook.js';
import { registerAuthRoutes } from './http/routes/auth.js';
import { registerHealthRoute } from './http/routes/health.js';
import { registerIdentityRoute } from './http/routes/identity.js';
import { registerDriveRoutes } from './http/routes/drive.js';
import { registerSwarmRoutes } from './http/routes/swarm.js';
import { registerTestRoutes } from './http/routes/_test.js';
import type {
  FileService,
  SwarmService,
  SwarmRuntime,
} from '@cinereel/hyper-sdk';
import type { SidecarDriveService } from './drive-service';
import {
  SidecarError,
  ErrorCode,
  toErrorBody,
  httpStatusFor,
} from './http/errors.js';

export interface Services {
  drives: SidecarDriveService;
  files: FileService;
  swarm: SwarmService;
  /**
   * Underlying `SwarmRuntime` from the SDK. Surfaced here (not on
   * `SwarmService`) because the SDK deliberately does NOT expose test
   * hooks on the public service surface — see the comment in
   * `registerTestRoutes` for the rationale. Test-only routes use this to
   * inject synthetic connections into `swarm.swarm.connections`.
   */
  swarmRuntime: SwarmRuntime;
}

export interface BuildServerOptions {
  /**
   * When true, register a couple of *test-only* routes under
   * `/v1/_test/...` that exercise SDK test hooks (`SwarmService.__testInjectPeer`).
   * Tests opt in explicitly via this flag; production code paths never set it.
   * The flag is dropped entirely when `NODE_ENV === 'production'`.
   */
  testRoutes?: boolean;
}

export async function buildServer(
  config: Config,
  uc: Services,
  options: BuildServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        process.env.NODE_ENV === 'production'
          ? undefined
          : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' } },
    },
  });

  await app.register(cors, {
    origin: ['http://127.0.0.1:5237', 'http://localhost:5237'],
  });

  await app.register(swagger, {
    openapi: {
      info: { title: 'CineReel Hyper Sidecar', version: '0.0.1' },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  // Public — no auth
  await registerHealthRoute(app);

  // /v1/auth/token is public — no auth preHandler applied to it
  await registerAuthRoutes(app);

  // Public registration of /v1/* so that swagger documents them BEFORE we add preHandler
  await registerIdentityRoute(app, uc.swarm);
  await registerDriveRoutes(app, { drives: uc.drives, files: uc.files });
  await registerSwarmRoutes(app, uc.swarm);

  // Test-only routes. Mounted only when the caller opts in AND we are not
  // running in production. The auth hook below also exempts this prefix so
  // tests can inject peers without juggling dev tokens.
  const wantsTestRoutes = options.testRoutes === true && process.env.NODE_ENV !== 'production';
  if (wantsTestRoutes) {
    await registerTestRoutes(app, uc.swarm, uc.swarmRuntime);
  }

  // Auth gate for /v1/* — but skip /v1/auth/* (those are their own auth logic)
  // and /v1/_test/* (test hooks, see BuildServerOptions.testRoutes).
  const authPreHandler = makeAuthPreHandler(config);
  app.addHook('preHandler', async (req, reply) => {
    if (
      !req.url.startsWith('/v1/') ||
      req.url.startsWith('/v1/auth') ||
      req.url.startsWith('/v1/_test/')
    ) {
      return;
    }
    await authPreHandler(req, reply);
  });

  // Error serializer
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof SidecarError) {
      reply.code(err.httpStatus).send(toErrorBody(err));
      return;
    }
    // Fastify schema validation errors
    if (Array.isArray((err as { validation?: unknown }).validation)) {
      reply.code(400).send({
        error: {
          code: ErrorCode.BAD_REQUEST,
          message: 'Request validation failed',
          details: (err as { validation: unknown }).validation,
        },
      });
      return;
    }
    const e = err as { message?: string };
    const code = ErrorCode.INTERNAL;
    reply.code(httpStatusFor(code)).send({
      error: { code, message: e.message ?? 'Internal error' },
    });
  });

  return app;
}
