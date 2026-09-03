import {
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { ZodResponse } from "nestjs-zod";
import { FileService } from "../../../hyper.implementation/file.service.js";
import {
  AddFileQueryDto,
  AddFileResponseDto,
  DeleteFileQueryDto,
  DeleteFileResponseDto,
  DriveKeyParamsDto,
  ListDirectoryQueryDto,
  ListDirectoryResponseDto,
} from "../../dto/files.dto.js";

function assertNever(value: never): never {
  throw new Error(`未处理的结果码: ${String(value)}`);
}

@ApiTags("files")
@Controller("v1/files")
export class FileController {
  constructor(@Inject(FileService) private readonly fileService: FileService) {}

  @Get(":driveKey/entries")
  @ApiOperation({
    operationId: "listDirectory",
    summary: "列出 Drive 目录的直接子项",
  })
  @ZodResponse({ status: HttpStatus.OK, type: ListDirectoryResponseDto })
  async listDirectory(
    @Param() params: DriveKeyParamsDto,
    @Query() query: ListDirectoryQueryDto,
  ) {
    return this.fileService.listDirectory(
      params.driveKey,
      query.path,
      query.cursor,
      query.limit,
    );
  }

  @Put(":driveKey")
  @ApiOperation({ operationId: "addFile", summary: "向可写 Drive 增加文件" })
  @ApiConsumes("application/octet-stream")
  @ApiBody({
    description: "要写入的文件内容（application/octet-stream）",
    schema: { type: "string", format: "binary" },
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: AddFileResponseDto })
  async add(
    @Param() params: DriveKeyParamsDto,
    @Query() query: AddFileQueryDto,
    @Req() request: Request,
  ) {
    const result = await this.fileService.addFile(
      params.driveKey,
      query.path,
      request,
    );

    switch (result) {
      case "created":
        return { ok: true as const };
      case "already-exists":
        throw new ConflictException("目标路径已经存在。");
      case "drive-not-writable":
        throw new ForbiddenException("当前 Hyper Client 没有该 Drive 的写权限。");
      case "file-too-large":
        throw new PayloadTooLargeException("文件不能超过 500 MiB。");
      default:
        return assertNever(result);
    }
  }

  @Delete(":driveKey")
  @ApiOperation({ operationId: "deleteFile", summary: "从可写 Drive 删除文件" })
  @ZodResponse({ status: HttpStatus.OK, type: DeleteFileResponseDto })
  async delete(
    @Param() params: DriveKeyParamsDto,
    @Query() query: DeleteFileQueryDto,
  ) {
    const result = await this.fileService.deleteFile(
      params.driveKey,
      query.path,
    );

    switch (result) {
      case "deleted":
        return { ok: true as const };
      case "not-found":
        throw new NotFoundException("目标路径不存在。");
      case "drive-not-writable":
        throw new ForbiddenException("当前 Hyper Client 没有该 Drive 的写权限。");
      default:
        return assertNever(result);
    }
  }
}
