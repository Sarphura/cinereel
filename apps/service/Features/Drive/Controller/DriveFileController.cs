using System.ComponentModel;
using Ardalis.Result;
using Ardalis.Result.AspNetCore;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace Cinereel.Features.Drive;

[ApiController]
[Route("api/drives/{driveId}/files")]
public sealed class DriveFileController(IDriveFileService driveFileService) : ControllerBase
{
    [HttpGet]
    [Produces("application/octet-stream")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden,
        Description = "目标位于 /.cinereel 协议保留目录，错误码为 reserved_path。")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<DriveFileDownloadResponse>> DownloadFile(
        string driveId,
        [FromQuery, BindRequired] string path,
        CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var parsedDriveId))
        {
            return Result<DriveFileDownloadResponse>.Invalid(
                    new ValidationError("driveId", "driveId 必须是非空 Guid。"))
                .ToActionResult(this);
        }

        if (!DriveFilePath.TryCreate(path, out var parsedPath))
        {
            return Result<DriveFileDownloadResponse>.Invalid(
                    new ValidationError("path", "path 必须是规范的 Drive 绝对文件路径。"))
                .ToActionResult(this);
        }

        var result = await driveFileService.DownloadFileAsync(
            parsedDriveId,
            parsedPath,
            cancellationToken);

        if (!result.IsSuccess)
        {
            return result.ToActionResult(this);
        }

        var download = result.Value;
        Response.RegisterForDispose(download);
        if (download.ContentLength is { } contentLength)
        {
            Response.ContentLength = contentLength;
        }

        return File(download.Content, download.ContentType, download.FileName);
    }

    [HttpGet("entries")]
    [TranslateResultToActionResult]
    [ExpectedFailures(
        ResultStatus.Invalid,
        ResultStatus.Forbidden,
        ResultStatus.NotFound,
        ResultStatus.Conflict,
        ResultStatus.CriticalError)]
    public async Task<Result<DriveDirectoryResponse>> ListDirectory(
        string driveId,
        [FromQuery, BindRequired] string path,
        [FromQuery] string? cursor,
        [FromQuery, DefaultValue(IDriveFileService.DefaultDirectoryPageSize)] int? limit,
        CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var parsedDriveId))
        {
            return Result<DriveDirectoryResponse>.Invalid(
                new ValidationError("driveId", "driveId 必须是非空 Guid。"));
        }

        if (!DriveDirectoryPath.TryCreate(path, out var parsedPath))
        {
            return Result<DriveDirectoryResponse>.Invalid(
                new ValidationError("path", "path 必须是规范的 Drive 绝对目录路径。"));
        }

        DriveDirectoryCursor? parsedCursor = null;

        if (!string.IsNullOrEmpty(cursor))
        {
            if (!DriveDirectoryCursor.TryParse(cursor, out var value))
            {
                return Result<DriveDirectoryResponse>.Invalid(
                    new ValidationError("cursor", "cursor 必须是有效的 Drive 目录游标。"));
            }

            parsedCursor = value;
        }

        var pageSize = limit ?? IDriveFileService.DefaultDirectoryPageSize;

        if (pageSize is < 1 or > IDriveFileService.MaxDirectoryPageSize)
        {
            return Result<DriveDirectoryResponse>.Invalid(
                new ValidationError(
                    "limit",
                    $"limit 必须是 1 到 {IDriveFileService.MaxDirectoryPageSize} 之间的整数。"));
        }

        return await driveFileService.ListDirectoryAsync(
            parsedDriveId,
            parsedPath,
            parsedCursor,
            pageSize,
            cancellationToken);
    }

    [HttpPut]
    [Consumes("application/octet-stream")]
    [DisableRequestSizeLimit]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [TranslateResultToActionResult]
    [ExpectedFailures(
        ResultStatus.Invalid,
        ResultStatus.Forbidden,
        ResultStatus.NotFound,
        ResultStatus.Conflict,
        ResultStatus.CriticalError)]
    public async Task<Result<object>> AddFile(
        string driveId,
        [FromQuery, BindRequired] string path,
        CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var parsedDriveId))
        {
            return Result<object>.Invalid(
                new ValidationError("driveId", "driveId 必须是非空 Guid。"));
        }

        if (!DriveFilePath.TryCreate(path, out var parsedPath))
        {
            return Result<object>.Invalid(
                new ValidationError("path", "path 必须是规范的 Drive 绝对文件路径。"));
        }

        if (Request.ContentLength > IDriveFileService.MaxFileSize)
        {
            return Result<object>.Invalid(
                new ValidationError("content", "文件不能超过 500 MiB。"));
        }

        return await driveFileService.AddFileAsync(
            parsedDriveId,
            parsedPath,
            Request.Body,
            cancellationToken);
    }

    [HttpDelete]
    [TranslateResultToActionResult]
    [ExpectedFailures(
        ResultStatus.Invalid,
        ResultStatus.Forbidden,
        ResultStatus.NotFound,
        ResultStatus.Conflict,
        ResultStatus.CriticalError)]
    public async Task<Result> DeleteFile(
        string driveId,
        [FromQuery, BindRequired] string path,
        CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var parsedDriveId))
        {
            return Result.Invalid(new ValidationError("driveId", "driveId 必须是非空 Guid。"));
        }

        if (!DriveFilePath.TryCreate(path, out var parsedPath))
        {
            return Result.Invalid(new ValidationError("path", "path 必须是规范的 Drive 绝对文件路径。"));
        }

        return await driveFileService.DeleteFileAsync(
            parsedDriveId,
            parsedPath,
            cancellationToken);
    }

    [HttpDelete("entries")]
    [TranslateResultToActionResult]
    [ExpectedFailures(
        ResultStatus.Invalid,
        ResultStatus.Forbidden,
        ResultStatus.NotFound,
        ResultStatus.Conflict,
        ResultStatus.CriticalError)]
    public async Task<Result> DeleteDirectory(
        string driveId,
        [FromQuery, BindRequired] string path,
        CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var parsedDriveId))
        {
            return Result.Invalid(new ValidationError("driveId", "driveId 必须是非空 Guid。"));
        }

        if (!DriveDirectoryPath.TryCreate(path, out var parsedPath))
        {
            return Result.Invalid(new ValidationError("path", "path 必须是规范的 Drive 绝对目录路径。"));
        }

        return await driveFileService.DeleteDirectoryAsync(
            parsedDriveId,
            parsedPath,
            cancellationToken);
    }

}
