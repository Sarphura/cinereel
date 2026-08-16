import type { CreateDriveRequestDto, DriveResponseDto } from '@hyper.api/dto/drives.dto';

export interface DriveInterface {
  createDrive(request: CreateDriveRequestDto): Promise<Boolean>;
  mountDrive(driveKey: string): Promise<Boolean>
  
  deleteDrive(driveKey: string): Promise<Boolean>;

  getDrive(driveKey: string): Promise<DriveResponseDto>;
  getDrives(): Promise<DriveResponseDto[]>;
}