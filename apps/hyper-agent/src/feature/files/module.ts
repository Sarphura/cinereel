/**
 * FilesModule — `GET /v1/files/:driveKey/*` (ticket 11, ADR 0047).
 *
 * Range-aware streaming for trailer playback. The legacy
 * `GET /v1/drives/:key/file?path=` route lives in
 * `feature/drives/controller.ts` and stays live for one release cycle.
 */
import { Module } from '@nestjs/common'
import { FilesController } from './controller.js'

@Module({ controllers: [FilesController] })
export class FilesModule {}
