using Ardalis.Result;
using Cinereel.Features.Torrent.Entity;
using Cinereel.Infrastructure;
using MediatR;
using Microsoft.EntityFrameworkCore;
using MonoTorrent;
using MonoTorrent.Client;

namespace Cinereel.Features.Torrent;

public sealed class AddTorrentCommandHandler(CinereelDbContext db)
    : IRequestHandler<AddTorrentCommand, Result<TorrentJobDto>>
{
    public async Task<Result<TorrentJobDto>> Handle(AddTorrentCommand command, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(command.Source))
            return Result.Invalid(new ValidationError("Source 不能为空。"));

        var savePath = string.IsNullOrWhiteSpace(command.SavePath)
            ? TorrentEngine.Instance.RootPath
            : command.SavePath;

        MonoTorrent.Torrent? torrent = null;
        MagnetLink? magnet = null;
        try
        {
            if (!MagnetLink.TryParse(command.Source, out magnet))
            {
                magnet = null;

                if (!System.IO.File.Exists(command.Source))
                    return Result.Invalid(new ValidationError($"无法识别的种子来源：{command.Source}。"));

                torrent = await MonoTorrent.Torrent.LoadAsync(command.Source);
            }
        }
        catch (Exception exception)
        {
            return Result.Error($"读取种子失败：{exception.Message}");
        }

        var infoHash = (magnet?.InfoHashes ?? torrent!.InfoHashes).V1OrV2.ToHex();

        if (await db.Set<TorrentJobEntity>().AnyAsync(job => job.InfoHash == infoHash, cancellationToken))
            return Result.Conflict($"种子 {infoHash} 已在任务列表中。");

        TorrentManager manager;
        try
        {
            Directory.CreateDirectory(savePath);

            manager = magnet is not null
                ? await TorrentRuntime.Engine.AddAsync(magnet, savePath)
                : await TorrentRuntime.Engine.AddAsync(torrent!, savePath);

            await manager.StartAsync();
        }
        catch (Exception exception)
        {
            return Result.Error($"添加任务失败：{exception.Message}");
        }

        var entity = new TorrentJobEntity
        {
            InfoHash = infoHash,
            Name = manager.Torrent?.Name ?? magnet?.Name ?? infoHash,
            Kind = TorrentJobKind.Download,
            Source = command.Source,
            TorrentFilePath = manager.MetadataPath,
            SavePath = savePath,
            TotalBytes = manager.Torrent?.Size ?? magnet?.Size ?? 0,
            Enabled = true
        };

        db.Set<TorrentJobEntity>().Add(entity);
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success(TorrentRuntime.ToDto(entity, manager));
    }
}

public sealed class CreateTorrentCommandHandler(CinereelDbContext db)
    : IRequestHandler<CreateTorrentCommand, Result<TorrentJobDto>>
{
    public async Task<Result<TorrentJobDto>> Handle(CreateTorrentCommand command, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(command.Path))
            return Result.Invalid(new ValidationError("Path 不能为空。"));

        var fullPath = Path.GetFullPath(command.Path);
        var isDirectory = Directory.Exists(fullPath);
        if (!isDirectory && !System.IO.File.Exists(fullPath))
            return Result.Invalid(new ValidationError($"路径不存在：{command.Path}。"));

        var engine = TorrentEngine.Instance;

        // 种子中的相对路径以源文件的父目录为基准，保存路径必须与之一致，做种时才无需搬动文件。
        var savePath = isDirectory
            ? Directory.GetParent(fullPath)?.FullName ?? engine.RootPath
            : Path.GetDirectoryName(fullPath) ?? engine.RootPath;

        var torrentFilePath = Path.Combine(
            engine.TorrentDirectory,
            $"{new DirectoryInfo(fullPath).Name}.torrent");

        try
        {
            Directory.CreateDirectory(engine.TorrentDirectory);

            var creator = new TorrentCreator(TorrentType.V1Only);
            await creator.CreateAsync(new TorrentFileSource(fullPath), torrentFilePath, cancellationToken);

            var torrent = await MonoTorrent.Torrent.LoadAsync(torrentFilePath);
            var infoHash = torrent.InfoHashes.V1OrV2.ToHex();

            if (await db.Set<TorrentJobEntity>().AnyAsync(job => job.InfoHash == infoHash, cancellationToken))
                return Result.Conflict($"种子 {infoHash} 已存在。");

            var manager = await engine.Engine.AddAsync(torrent, savePath);
            await manager.StartAsync();

            var entity = new TorrentJobEntity
            {
                InfoHash = infoHash,
                Name = torrent.Name,
                Kind = TorrentJobKind.Seed,
                Source = fullPath,
                TorrentFilePath = torrentFilePath,
                SavePath = savePath,
                TotalBytes = torrent.Size,
                Enabled = true
            };

            db.Set<TorrentJobEntity>().Add(entity);
            await db.SaveChangesAsync(cancellationToken);

            return Result.Success(TorrentRuntime.ToDto(entity, manager));
        }
        catch (Exception exception)
        {
            return Result.Error($"制作种子失败：{exception.Message}");
        }
    }
}

public sealed class SetTorrentEnabledCommandHandler(CinereelDbContext db)
    : IRequestHandler<SetTorrentEnabledCommand, Result<TorrentJobDto>>
{
    public async Task<Result<TorrentJobDto>> Handle(SetTorrentEnabledCommand command, CancellationToken cancellationToken)
    {
        var job = await db.Set<TorrentJobEntity>()
            .FirstOrDefaultAsync(job => job.Id == command.Id, cancellationToken);

        if (job is null)
            return Result.NotFound($"未找到 {command.Id}。");

        try
        {
            var manager = TorrentRuntime.Find(job.InfoHash);

            if (command.Enabled)
            {
                if (manager is null)
                    manager = await TorrentRuntime.AttachAsync(job);
                else
                    await manager.StartAsync();
            }
            else if (manager is not null)
            {
                await manager.StopAsync();
            }

            job.Enabled = command.Enabled;
            await db.SaveChangesAsync(cancellationToken);

            return Result.Success(manager is null
                ? TorrentRuntime.ToDto(job)
                : TorrentRuntime.ToDto(job, manager));
        }
        catch (Exception exception)
        {
            return Result.Error($"更新任务状态失败：{exception.Message}");
        }
    }
}

public sealed class RemoveTorrentCommandHandler(CinereelDbContext db)
    : IRequestHandler<RemoveTorrentCommand, Result>
{
    public async Task<Result> Handle(RemoveTorrentCommand command, CancellationToken cancellationToken)
    {
        var job = await db.Set<TorrentJobEntity>()
            .FirstOrDefaultAsync(job => job.Id == command.Id, cancellationToken);

        if (job is null)
            return Result.NotFound($"未找到 {command.Id}。");

        try
        {
            var manager = TorrentRuntime.Find(job.InfoHash);
            if (manager is not null)
            {
                // 引擎要求先停机再注销，否则抛 "The manager must be stopped before it can be unregistered"。
                await manager.StopAsync();
                await TorrentRuntime.Engine.RemoveAsync(
                    manager,
                    command.DeleteFiles ? RemoveMode.CacheDataAndDownloadedData : RemoveMode.CacheDataOnly);
            }
        }
        catch (Exception exception)
        {
            return Result.Error($"从引擎移除任务失败：{exception.Message}");
        }

        db.Set<TorrentJobEntity>().Remove(job);
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}
