using System.ComponentModel;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace Cinereel.Features.Drive;

[ApiController]
[Route("api/drives/{driveId}/files")]
public sealed class DriveFileController(IDriveFileService driveFileService) : ControllerBase
{
    [HttpGet("entries")]
    [ProducesResponseType<DriveDirectoryResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<DriveDirectoryResponse>> ListDirectory(
        string driveId,
        [FromQuery, BindRequired] string path,
        [FromQuery] string? cursor,
        [FromQuery, DefaultValue(IDriveFileService.DefaultDirectoryPageSize)] int? limit,
        CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var parsedDriveId))
        {
            return InvalidDriveId();
        }

        if (!DriveDirectoryPath.TryCreate(path, out var parsedPath))
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "path 必须是规范的 Drive 绝对目录路径。");
        }

        DriveDirectoryCursor? parsedCursor = null;

        if (!string.IsNullOrEmpty(cursor))
        {
            if (!DriveDirectoryCursor.TryParse(cursor, out var value))
            {
                return Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "cursor 必须是有效的 Drive 目录游标。");
            }

            parsedCursor = value;
        }

        var pageSize = limit ?? IDriveFileService.DefaultDirectoryPageSize;

        if (pageSize is < 1 or > IDriveFileService.MaxDirectoryPageSize)
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: $"limit 必须是 1 到 {IDriveFileService.MaxDirectoryPageSize} 之间的整数。");
        }

        var result = await driveFileService.ListDirectoryAsync(
            parsedDriveId,
            parsedPath,
            parsedCursor,
            pageSize,
            cancellationToken);

        return result.ResultCode switch
        {
            ListDriveDirectoryResultCode.Listed => Ok(result.Directory!),
            ListDriveDirectoryResultCode.DriveNotFound => DriveNotFound(),
            ListDriveDirectoryResultCode.DriveNotReady => DriveNotReady(),
            ListDriveDirectoryResultCode.VersionConflict => Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "Drive 内容版本已变化，请从第一页重新列举目录。"),
            ListDriveDirectoryResultCode.ContentUnavailable => ContentUnavailable(),
            _ => throw new ArgumentOutOfRangeException(nameof(result))
        };
    }

    [HttpPut]
    [Consumes("application/octet-stream")]
    [DisableRequestSizeLimit]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status413PayloadTooLarge)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status415UnsupportedMediaType)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> AddFile(
        string driveId,
        [FromQuery, BindRequired] string path,
        CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var parsedDriveId))
        {
            return InvalidDriveId();
        }

        if (!DriveFilePath.TryCreate(path, out var parsedPath))
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "path 必须是规范的 Drive 绝对文件路径。");
        }

        if (Request.ContentLength > IDriveFileService.MaxFileSize)
        {
            return Problem(
                statusCode: StatusCodes.Status413PayloadTooLarge,
                title: "文件不能超过 500 MiB。");
        }

        var resultCode = await driveFileService.AddFileAsync(
            parsedDriveId,
            parsedPath,
            Request.Body,
            cancellationToken);

        return resultCode switch
        {
            AddDriveFileResultCode.Created => StatusCode(StatusCodes.Status201Created),
            AddDriveFileResultCode.DriveNotFound => DriveNotFound(),
            AddDriveFileResultCode.DriveNotReady => DriveNotReady(),
            AddDriveFileResultCode.WriteNotAllowed => WriteNotAllowed(),
            AddDriveFileResultCode.AlreadyExists => Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "目标路径已经存在。"),
            AddDriveFileResultCode.FileTooLarge => Problem(
                statusCode: StatusCodes.Status413PayloadTooLarge,
                title: "文件不能超过 500 MiB。"),
            AddDriveFileResultCode.ContentUnavailable => ContentUnavailable(),
            _ => throw new ArgumentOutOfRangeException(nameof(resultCode))
        };
    }

    [HttpDelete]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> DeleteFile(
        string driveId,
        [FromQuery, BindRequired] string path,
        CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var parsedDriveId))
        {
            return InvalidDriveId();
        }

        if (!DriveFilePath.TryCreate(path, out var parsedPath))
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "path 必须是规范的 Drive 绝对文件路径。");
        }

        var resultCode = await driveFileService.DeleteFileAsync(
            parsedDriveId,
            parsedPath,
            cancellationToken);

        return resultCode switch
        {
            DeleteDriveFileResultCode.Deleted => NoContent(),
            DeleteDriveFileResultCode.DriveNotFound => DriveNotFound(),
            DeleteDriveFileResultCode.DriveNotReady => DriveNotReady(),
            DeleteDriveFileResultCode.WriteNotAllowed => WriteNotAllowed(),
            DeleteDriveFileResultCode.FileNotFound => Problem(
                statusCode: StatusCodes.Status404NotFound,
                title: "目标文件不存在。"),
            DeleteDriveFileResultCode.ContentUnavailable => ContentUnavailable(),
            _ => throw new ArgumentOutOfRangeException(nameof(resultCode))
        };
    }

    [HttpDelete("entries")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> DeleteDirectory(
        string driveId,
        [FromQuery, BindRequired] string path,
        CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var parsedDriveId))
        {
            return InvalidDriveId();
        }

        if (!DriveDirectoryPath.TryCreate(path, out var parsedPath))
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "path 必须是规范的 Drive 绝对目录路径。");
        }

        var resultCode = await driveFileService.DeleteDirectoryAsync(
            parsedDriveId,
            parsedPath,
            cancellationToken);

        return resultCode switch
        {
            DeleteDriveDirectoryResultCode.Deleted => NoContent(),
            DeleteDriveDirectoryResultCode.DriveNotFound => DriveNotFound(),
            DeleteDriveDirectoryResultCode.DriveNotReady => DriveNotReady(),
            DeleteDriveDirectoryResultCode.WriteNotAllowed => WriteNotAllowed(),
            DeleteDriveDirectoryResultCode.ContentUnavailable => ContentUnavailable(),
            _ => throw new ArgumentOutOfRangeException(nameof(resultCode))
        };
    }

    private ObjectResult InvalidDriveId()
    {
        return Problem(
            statusCode: StatusCodes.Status400BadRequest,
            title: "driveId 必须是非空 Guid。");
    }

    private ObjectResult DriveNotFound()
    {
        return Problem(
            statusCode: StatusCodes.Status404NotFound,
            title: "Drive 不存在。其关系可能已被移除。");
    }

    private ObjectResult DriveNotReady()
    {
        return Problem(
            statusCode: StatusCodes.Status409Conflict,
            title: "Drive 尚未就绪。");
    }

    private ObjectResult WriteNotAllowed()
    {
        return Problem(
            statusCode: StatusCodes.Status403Forbidden,
            title: "当前 Cinereel 不持有该 Drive 的写权限。");
    }

    private ObjectResult ContentUnavailable()
    {
        return Problem(
            statusCode: StatusCodes.Status503ServiceUnavailable,
            title: "Drive 内容暂不可用。请稍后重试。");
    }
}
