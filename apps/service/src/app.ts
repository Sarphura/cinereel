import Fastify from 'fastify'
import cors from '@fastify/cors'
import { createHyperModule } from './base/hyper'
import { registerLibraryController } from './modules/library/controller'
import { registerMountController } from './modules/mount/controller'
import { registerDownloadController } from './modules/download/controller'
import { registerRemoteController } from './modules/remote/controller'
import { registerStatusController } from './modules/status/controller'
import { registerSubscribedDriveController } from './modules/subscribed-drive/controller'
import { registerPublicationController } from './modules/publication/controller'
import { registerDriveCoreController, registerDriveTreeController, registerDriveMediaController, registerDriveProfileController } from './modules/drive/controller'
import { registerPreviewController } from './modules/preview/controller'
import { registerProfileController } from './modules/profile/controller'
import { registerScanController } from './modules/scan/controller'
import { registerMoviesController } from './modules/movies/controller'

import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'

export interface CreateAppOptions {
  logger?: boolean
  network?: boolean
}

export async function createApp(
  options: CreateAppOptions = {},
) {
  const app = Fastify({
    logger: options.logger ?? true,
  })

  await app.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Cinereel API',
        description: 'Cinereel P2P 服务端接口文档',
        version: '1.0.0'
      }
    }
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false
    }
  })

  const hyper = await createHyperModule(app.log, {
    network: options.network,
  })

  await registerStatusController(app, hyper)
  await registerProfileController(app, hyper)
  await registerDriveCoreController(app, hyper)
  await registerDriveTreeController(app, hyper)
  await registerDriveMediaController(app, hyper)
  await registerDriveProfileController(app, hyper)
  await registerLibraryController(app, hyper)
  await registerPublicationController(app, hyper)
  await registerMountController(app, hyper)
  await registerDownloadController(app, hyper)
  await registerScanController(app)
  await registerRemoteController(app, hyper)
  await registerSubscribedDriveController(app, hyper)
  await registerPreviewController(app, hyper)
  await registerMoviesController(app, hyper)

  return {
    app,
    hyper,
  }
}
