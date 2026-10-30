using Ardalis.Result;
using Cinereel.Features.Torrent.Entity;
using Cinereel.Infrastructure;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Cinereel.Features.Torrent;

public sealed class ListTorrentsQueryHandler(CinereelDbContext db)
    : IRequestHandler<ListTorrentsQuery, Result<IReadOnlyList<TorrentJobDto>>>
{
    public async Task<Result<IReadOnlyList<TorrentJobDto>>> Handle(ListTorrentsQuery request, CancellationToken cancellationToken)
    {
        var jobs = await db.Set<TorrentJobEntity>()
            .AsNoTracking()
            .OrderBy(job => job.Id)
            .Take(100)
            .ToListAsync(cancellationToken);

        return Result.Success<IReadOnlyList<TorrentJobDto>>(jobs.Select(job => TorrentRuntime.ToDto(job)).ToList());
    }
}
