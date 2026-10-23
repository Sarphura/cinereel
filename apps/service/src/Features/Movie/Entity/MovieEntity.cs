using Cinereel.Base.Domain;
namespace Cinereel.Features.Movie.Entity;

/// <summary>TMDB Movie Details 的持久化映射。</summary>
public class MovieEntity : FullTrackedEntity
{
    public int TmdbId { get; set; }
    public string? ImdbId { get; set; }

    public string Title { get; set; } = null!;
    public string OriginalTitle { get; set; } = null!;
    public string? Overview { get; set; }
    public string? Tagline { get; set; }
    public string OriginalLanguage { get; set; } = null!;
    public string? Homepage { get; set; }

    public DateOnly? ReleaseDate { get; set; }
    public int? Runtime { get; set; }
    public string? Status { get; set; }

    public bool Adult { get; set; }
    public bool Video { get; set; }
    public double Popularity { get; set; }
    public double VoteAverage { get; set; }
    public int VoteCount { get; set; }

    public long Budget { get; set; }
    public long Revenue { get; set; }

    public string? PosterPath { get; set; }
    public string? BackdropPath { get; set; }

    public List<Guid> GenreIds { get; set; } = [];
    public List<string> OriginCountry { get; set; } = [];
    public List<Guid> ProductionCompanyIds { get; set; } = [];
    public List<Guid> ProductionCountryIds { get; set; } = [];
    public List<Guid> SpokenLanguageIds { get; set; } = [];
    public Guid? BelongsToCollection { get; set; }
}