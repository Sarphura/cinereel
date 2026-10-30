using Ardalis.Specification;
using Cinereel.Features.Movie.Entity;

namespace Cinereel.Features.Movie;

/// <summary>电影仓储。通用 CRUD 由 <see cref="IRepositoryBase{T}"/> 提供，查询条件用 Specification 表达。</summary>
public interface IMovieRepository : IRepositoryBase<MovieEntity>
{
    /// <summary>TmdbId 上有唯一索引，写入前用它先做冲突判断。</summary>
    Task<bool> TmdbIdExistsAsync(int tmdbId, CancellationToken cancellationToken = default);
}
