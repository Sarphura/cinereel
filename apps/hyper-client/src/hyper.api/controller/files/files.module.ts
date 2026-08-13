/**
 * FilesModule — all file operations under `/v1/files/:driveKey/*`.
 *
 * Covers reads (Range-aware), writes, deletes, tree listing, and entry
 * metadata. Imports BootstrapModule for DriveService / FileService access.
 */
import { Module } from '@nestjs/common'
import { BootstrapModule } from '../../../hyper.domain/bootstrap/bootstrap.module.js'
import { FilesController } from './files.controller.js'

@Module({ imports: [BootstrapModule], controllers: [FilesController] })
export class FilesModule {}
