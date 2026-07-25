/**
 * VersionModule — `GET /v1/version`.
 *
 * The Hyper Agent's identity endpoint (ticket 10). The Application
 * Server polls this immediately after `/healthz` returns 200 and
 * refuses to proceed if the version strings differ.
 */
import { Module } from '@nestjs/common'
import { VersionController } from './controller.js'

@Module({ controllers: [VersionController] })
export class VersionModule {}
