import Fastify from 'fastify'
import cors from '@fastify/cors'
import { createHyperModule } from './infra/hyper'
import { registerLibraryController } from './modules/library/controller'
import { registerMountController } from './modules/mount/controller'
import { registerDownloadController } from './modules/download/controller'
import { registerRemoteController } from './modules/remote/controller'
import { registerStatusController } from './modules/status/controller'
import { registerSubscriptionController } from './modules/subscription/controller'
import { registerPublicationController } from './modules/publication/controller'
import { registerDriveController } from './modules/drive/controller'
import { registerPreviewController } from './modules/preview/controller'
import { registerProfileController } from './modules/profile/controller'

export async function createApp() {
  const app = Fastify({
    logger: true,
  })

  await app.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  const hyper = await createHyperModule(app.log)

  await registerStatusController(app, hyper)
  await registerProfileController(app, hyper)
  await registerDriveController(app, hyper)
  await registerLibraryController(app, hyper)
  await registerPublicationController(app, hyper)
  await registerMountController(app, hyper)
  await registerDownloadController(app, hyper)
  await registerRemoteController(app, hyper)
  await registerSubscriptionController(app, hyper)
  await registerPreviewController(app, hyper)

  return {
    app,
    hyper,
  }
}
