namespace Cinereel.Features.Drive;

internal sealed class DriveManifestService(IHyperClient hyperClient) : IDriveManifestService
{
    private static readonly DriveFilePath ManifestPath = CreateManifestPath();

    public async Task<ReadDriveManifestResult> ReadAsync(
        DriveKey driveKey,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        try
        {
            var result = await hyperClient.ReadProtocolFileAsync(
                driveKey, ManifestPath, cancellationToken);
            return result.ResultCode switch
            {
                HyperReadProtocolFileResultCode.Success => DriveManifest.Parse(result.Content!) with
                {
                    ETag = result.ETag,
                    DriveVersion = result.DriveVersion
                },
                HyperReadProtocolFileResultCode.NotFound => new(ReadDriveManifestResultCode.NotFound),
                HyperReadProtocolFileResultCode.InvalidTarget => new(ReadDriveManifestResultCode.Invalid),
                HyperReadProtocolFileResultCode.TooLarge => new(ReadDriveManifestResultCode.TooLarge),
                HyperReadProtocolFileResultCode.Timeout => new(ReadDriveManifestResultCode.Timeout),
                _ => new(ReadDriveManifestResultCode.Unavailable)
            };
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new(ReadDriveManifestResultCode.Timeout);
        }
        catch (Exception exception) when (exception is
            HttpRequestException or IOException or HyperClientException)
        {
            return new(ReadDriveManifestResultCode.Unavailable);
        }
    }

    public async Task<WriteDriveManifestResult> WriteAsync(
        DriveKey driveKey,
        DriveManifest manifest,
        string? expectedETag,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (manifest.HasUnknownFields)
        {
            return new(WriteDriveManifestResultCode.UnknownFields);
        }

        byte[] content;
        try
        {
            content = manifest.Serialize();
        }
        catch (ArgumentException)
        {
            return new(WriteDriveManifestResultCode.Invalid);
        }

        if (content.Length > DriveManifest.MaxByteLength)
        {
            return new(WriteDriveManifestResultCode.TooLarge);
        }

        try
        {
            var result = await hyperClient.WriteProtocolFileAsync(
                driveKey, ManifestPath, content, expectedETag, cancellationToken);
            return new(result.ResultCode switch
            {
                HyperWriteProtocolFileResultCode.Written => WriteDriveManifestResultCode.Written,
                HyperWriteProtocolFileResultCode.Conflict => WriteDriveManifestResultCode.Conflict,
                HyperWriteProtocolFileResultCode.NotWritable => WriteDriveManifestResultCode.NotWritable,
                HyperWriteProtocolFileResultCode.TargetConflict => WriteDriveManifestResultCode.TargetConflict,
                HyperWriteProtocolFileResultCode.TooLarge => WriteDriveManifestResultCode.TooLarge,
                HyperWriteProtocolFileResultCode.Timeout => WriteDriveManifestResultCode.Timeout,
                _ => WriteDriveManifestResultCode.Unavailable
            });
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new(WriteDriveManifestResultCode.Timeout);
        }
        catch (Exception exception) when (exception is
            HttpRequestException or IOException or HyperClientException)
        {
            return new(WriteDriveManifestResultCode.Unavailable);
        }
    }

    private static DriveFilePath CreateManifestPath()
    {
        if (!DriveFilePath.TryCreate(DriveManifest.Path, out var path))
        {
            throw new InvalidOperationException("DriveManifest 固定路径无效。");
        }

        return path;
    }
}
