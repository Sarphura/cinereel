using Ardalis.Result;
using Ardalis.Result.AspNetCore;
using Cinereel.Base.Domain;
using Cinereel.Infrastructure;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Cinereel.Features.Movie;

public class MovieEntity : FullTrackedEntity
{
    public string Title { get; set; } = null!;
}

/// <summary>只写约定推断不出的部分（索引、约束、列类型、值转换等）。</summary>
public sealed class MovieEntityConfiguration : IEntityTypeConfiguration<MovieEntity>
{
    public void Configure(EntityTypeBuilder<MovieEntity> builder)
    {
    }
}

public sealed record CreateMovieCommand(string Title) : IRequest<Result<Guid>>;

public sealed class CreateMovieCommandHandler(CinereelDbContext db)
    : IRequestHandler<CreateMovieCommand, Result<Guid>>
{
    public async Task<Result<Guid>> Handle(CreateMovieCommand command, CancellationToken cancellationToken)
    {
        var movie = new MovieEntity { Title = command.Title };

        db.Set<MovieEntity>().Add(movie);
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success(movie.Id);
    }
}

public sealed record GetMovieQuery(Guid Id) : IRequest<Result<MovieEntity>>;

public sealed class GetMovieQueryHandler(CinereelDbContext db)
    : IRequestHandler<GetMovieQuery, Result<MovieEntity>>
{
    public async Task<Result<MovieEntity>> Handle(GetMovieQuery request, CancellationToken cancellationToken)
    {
        var movie = await db.Set<MovieEntity>()
            .AsNoTracking()
            .FirstOrDefaultAsync(movie => movie.Id == request.Id, cancellationToken);

        return movie is null
            ? Result.NotFound($"未找到 {request.Id}。")
            : Result.Success(movie);
    }
}

public sealed record ListMoviesQuery : IRequest<Result<IReadOnlyList<MovieEntity>>>;

public sealed class ListMoviesQueryHandler(CinereelDbContext db)
    : IRequestHandler<ListMoviesQuery, Result<IReadOnlyList<MovieEntity>>>
{
    public async Task<Result<IReadOnlyList<MovieEntity>>> Handle(ListMoviesQuery request, CancellationToken cancellationToken)
    {
        var movies = await db.Set<MovieEntity>()
            .AsNoTracking()
            // SQLite 不支持对 DateTimeOffset 排序，故按主键排序。
            .OrderBy(movie => movie.Id)
            .Take(100)
            .ToListAsync(cancellationToken);

        return Result.Success<IReadOnlyList<MovieEntity>>(movies);
    }
}

public sealed record UpdateMovieCommand(Guid Id, string Title) : IRequest<Result>;

public sealed class UpdateMovieCommandHandler(CinereelDbContext db)
    : IRequestHandler<UpdateMovieCommand, Result>
{
    public async Task<Result> Handle(UpdateMovieCommand command, CancellationToken cancellationToken)
    {
        var movie = await db.Set<MovieEntity>()
            .FirstOrDefaultAsync(movie => movie.Id == command.Id, cancellationToken);

        if (movie is null)
        {
            return Result.NotFound($"未找到 {command.Id}。");
        }

        movie.Title = command.Title;
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}

public sealed record DeleteMovieCommand(Guid Id) : IRequest<Result>;

public sealed class DeleteMovieCommandHandler(CinereelDbContext db)
    : IRequestHandler<DeleteMovieCommand, Result>
{
    public async Task<Result> Handle(DeleteMovieCommand command, CancellationToken cancellationToken)
    {
        var deleted = await db.Set<MovieEntity>()
            .Where(movie => movie.Id == command.Id)
            .ExecuteDeleteAsync(cancellationToken);

        return deleted == 0
            ? Result.NotFound($"未找到 {command.Id}。")
            : Result.Success();
    }
}

[ApiController]
[TranslateResultToActionResult]
[Route("api/[controller]")]
public sealed class MovieController(IMediator mediator) : ControllerBase
{
    [HttpPost]
    public async Task<Result<Guid>> Create(CreateMovieCommand command, CancellationToken cancellationToken)
        => await mediator.Send(command, cancellationToken);

    [HttpGet("{id:guid}")]
    public async Task<Result<MovieEntity>> Get(Guid id, CancellationToken cancellationToken)
        => await mediator.Send(new GetMovieQuery(id), cancellationToken);

    [HttpGet]
    public async Task<Result<IReadOnlyList<MovieEntity>>> List(CancellationToken cancellationToken)
        => await mediator.Send(new ListMoviesQuery(), cancellationToken);

    [HttpPut("{id:guid}")]
    public async Task<Result> Update(Guid id, UpdateMovieCommand command, CancellationToken cancellationToken)
        => await mediator.Send(command with { Id = id }, cancellationToken);

    [HttpDelete("{id:guid}")]
    public async Task<Result> Delete(Guid id, CancellationToken cancellationToken)
        => await mediator.Send(new DeleteMovieCommand(id), cancellationToken);
}
