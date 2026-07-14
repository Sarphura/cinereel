import { Module } from '@nestjs/common'
import { DriveBaseModule } from '@/modules/base/drive/drive.base.module'
import { SwarmModule } from '@/modules/base/swarm/swarm.module'
import { ProfileController } from './controller/profile.controller'
import { ProfileService } from './service/profile.service'

@Module({
  imports: [DriveBaseModule, SwarmModule],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
