import {
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Head,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Put,
  Query,
  Req,
  Res,
  applyDecorators,
} from "@nestjs/common";
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiHeader,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request, Response } from "express";
import { once } from "node:events";
import type { Readable } from "node:stream";
import { ZodResponse } from "nestjs-zod";
import {
  FileReadError,
  FileService,
} from "../../../hyper.implementation/file.service.js";
import {
  AddFileQueryDto,
  AddFileResponseDto,
  DeleteDirectoryQueryDto,
  DeleteDirectoryResponseDto,
  DeleteFileQueryDto,
  DeleteFileResponseDto,
  DriveKeyParamsDto,
  ListDirectoryQueryDto,
  ListDirectoryResponseDto,
  ReadFileQueryDto,
} from "../../dto/files.dto.js";

function assertNever(value: never): never {
  throw new Error(`未处理的结果码: ${String(value)}`);
}

const fileHeaders = {
  "Content-Type": { schema: { type: "string" } },
  "Content-Length": { schema: { type: "integer" } },
  "Content-Disposition": { schema: { type: "string" } },
  "Accept-Ranges": { schema: { type: "string", example: "bytes" } },
  ETag: { schema: { type: "string" } },
  "X-Drive-Version": { schema: { type: "integer" } },
};

function ApiFileResponse(head: boolean) {
  const binaryContent = {
    "application/octet-stream": {
      schema: { type: "string", format: "binary" },
    },
  };
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: head ? "文件元数据，不返回正文" : "完整文件内容",
      headers: fileHeaders,
      ...(head ? {} : { content: binaryContent }),
    }),
    ...(head
      ? []
      : [
          ApiHeader({
            name: "Range",
            required: false,
            description: "单段字节范围，例如 bytes=0-1023；非法格式、未知单位和多段范围忽略",
          }),
          ApiHeader({
            name: "If-Range",
            required: false,
            description: "仅与当前 ETag 完全匹配时返回范围内容",
          }),
          ApiResponse({
            status: 206,
            description: "单段文件内容",
            headers: {
              ...fileHeaders,
              "Content-Range": { schema: { type: "string" } },
            },
            content: binaryContent,
          }),
          ApiResponse({
            status: 416,
            description: "范围不可满足",
            headers: {
              "Content-Range": {
                schema: { type: "string", example: "bytes */100" },
              },
            },
          }),
        ]),
    ...[
      [400, "参数非法"],
      [404, "文件不存在"],
      [409, "目标为目录或符号链接"],
      [503, "文件内容暂不可用"],
      [504, "等待元数据或文件块超时"],
    ].map(([status, description]) =>
      ApiResponse({ status: Number(status), description: String(description) }),
    ),
  );
}

@ApiTags("files")
@Controller("v1/files")
export class FileController {
  constructor(@Inject(FileService) private readonly fileService: FileService) {}

  // Express 会用 GET 匹配 HEAD，因此必须先注册独立的元数据路由。
  @Head(":driveKey")
  @ApiOperation({ operationId: "headFile", summary: "读取文件元数据" })
  @ApiFileResponse(true)
  async head(
    @Param() params: DriveKeyParamsDto,
    @Query() query: ReadFileQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await this.readContent(params, query, request, response, true);
  }

  @Get(":driveKey")
  @ApiOperation({ operationId: "readFile", summary: "流式读取、下载或播放文件" })
  @ApiFileResponse(false)
  async read(
    @Param() params: DriveKeyParamsDto,
    @Query() query: ReadFileQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await this.readContent(params, query, request, response, false);
  }

  private async readContent(
    params: DriveKeyParamsDto,
    query: ReadFileQueryDto,
    request: Request,
    response: Response,
    head: boolean,
  ): Promise<void> {
    const cancellation = new AbortController();
    let session: Awaited<ReturnType<FileService["openReadSession"]>> | undefined;
    let source: Readable | undefined;
    const disconnect = () => {
      if (!response.writableFinished) {
        cancellation.abort();
        source?.destroy();
      }
    };
    request.on("aborted", disconnect);
    response.on("close", disconnect);

    try {
      session = await this.fileService.openReadSession(params.driveKey, {
        driveVersion: query.driveVersion,
        signal: cancellation.signal,
      });
      const file = await session.getFile(query.path);
      cancellation.signal.throwIfAborted();
      if (file.type === "symlink") {
        throw new ConflictException("不能直接读取符号链接。");
      }

      let range: { start: number; end: number } | undefined;
      let unsatisfiable = false;
      const rawRange = request.get("Range");
      const ifRange = request.get("If-Range");
      if (
        !head &&
        rawRange &&
        (!ifRange || ifRange === file.etag) &&
        /^bytes=(?:[0-9]+-[0-9]*|-[0-9]+)$/u.test(rawRange)
      ) {
        const ranges = request.range(file.size);
        unsatisfiable = ranges === -1;
        // range-parser 会把超长后缀当作负起点，HTTP 规定此时返回完整范围。
        if (
          rawRange.startsWith("bytes=-") &&
          file.size > 0 &&
          Number(rawRange.slice(7)) >= file.size
        ) {
          range = { start: 0, end: file.size - 1 };
          unsatisfiable = false;
        }
        if (
          ranges &&
          ranges !== -1 &&
          ranges !== -2 &&
          ranges.type === "bytes" &&
          ranges.length === 1
        ) {
          range = ranges[0];
        }
      }

      const driveVersion = session.driveVersion;
      const expectedBytes = range ? range.end - range.start + 1 : file.size;
      const setHeaders = () => {
        response.attachment(file.path);
        if (query.disposition === "inline") {
          const disposition = String(response.getHeader("Content-Disposition"));
          response.setHeader(
            "Content-Disposition",
            disposition.replace(/^attachment/u, "inline"),
          );
        }
        response.setHeader("Accept-Ranges", "bytes");
        response.setHeader("ETag", file.etag);
        response.setHeader("X-Drive-Version", String(driveVersion));
        response.setHeader("Content-Length", expectedBytes);
        if (range) {
          response.setHeader(
            "Content-Range",
            `bytes ${range.start}-${range.end}/${file.size}`,
          );
        }
      };

      if (head || file.size === 0 || unsatisfiable) {
        setHeaders();
        if (unsatisfiable) {
          response.status(416);
          response.setHeader("Content-Range", `bytes */${file.size}`);
          response.setHeader("Content-Length", 0);
        } else {
          response.status(200);
        }
        response.end();
        return;
      }

      source = session.createReadStream(file, range);
      const iterator = source[Symbol.asyncIterator]();
      // 首块就绪后才提交响应，保留缺块超时的 JSON 错误响应能力。
      let next = await iterator.next();
      cancellation.signal.throwIfAborted();
      if (next.done) {
        throw new HttpException("文件内容暂不可用。", HttpStatus.SERVICE_UNAVAILABLE);
      }
      response.status(range ? 206 : 200);
      let writtenBytes = 0;
      while (!next.done) {
        const chunkBytes = Buffer.byteLength(next.value);
        if (writtenBytes + chunkBytes > expectedBytes) {
          throw new FileReadError("content-unavailable", 503, "文件内容超过声明的长度。");
        }
        if (chunkBytes > 0) {
          if (writtenBytes === 0) setHeaders();
          if (!response.write(next.value)) {
            await once(response, "drain", { signal: cancellation.signal });
          }
          writtenBytes += chunkBytes;
        }
        next = await iterator.next();
        cancellation.signal.throwIfAborted();
      }
      if (writtenBytes !== expectedBytes) {
        throw new FileReadError("content-unavailable", 503, "文件内容短于声明的长度。");
      }
      response.end();
    } catch (error) {
      if (cancellation.signal.aborted || response.destroyed) return;
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      if (error instanceof FileReadError) {
        throw new HttpException(
          { statusCode: error.status, code: error.code, message: error.message },
          error.status,
        );
      }
      throw error;
    } finally {
      request.off("aborted", disconnect);
      response.off("close", disconnect);
      source?.destroy();
      await session?.close();
    }
  }

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

  @Delete(":driveKey/entries")
  @ApiOperation({
    operationId: "deleteDirectory",
    summary: "递归删除 Drive 目录",
  })
  @ZodResponse({ status: HttpStatus.OK, type: DeleteDirectoryResponseDto })
  async deleteDirectory(
    @Param() params: DriveKeyParamsDto,
    @Query() query: DeleteDirectoryQueryDto,
  ) {
    const result = await this.fileService.deleteDirectory(
      params.driveKey,
      query.path,
    );

    switch (result) {
      case "deleted":
        return { ok: true as const };
      case "drive-not-writable":
        throw new ForbiddenException("当前 Hyper Client 没有该 Drive 的写权限。");
      default:
        return assertNever(result);
    }
  }
}
