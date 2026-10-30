using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Cinereel.Features.Movie.Entity;

public sealed class MovieEntityConfiguration : IEntityTypeConfiguration<MovieEntity>
{
    public void Configure(EntityTypeBuilder<MovieEntity> builder)
    {
        builder.ToTable("Movies");
        builder.HasIndex(movie => movie.TmdbId).IsUnique();

        // TMDB 的对象数组只保留其 id，按 JSON 数组落库；查询时 Contains 会翻译成 json_each。
        builder.PrimitiveCollection(movie => movie.GenreIds);
        builder.PrimitiveCollection(movie => movie.ProductionCompanyIds);
        builder.PrimitiveCollection(movie => movie.ProductionCountryIds);
        builder.PrimitiveCollection(movie => movie.SpokenLanguageIds);
        builder.PrimitiveCollection(movie => movie.OriginCountry);
    }
}
