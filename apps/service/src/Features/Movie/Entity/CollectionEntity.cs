using Cinereel.Base.Domain;
namespace Cinereel.Features.Movie.Entity;

public class CollectionEntity : FullTrackedEntity
{
    public string Name { get; set; } = null!;
    public string? PosterPath { get; set; }
    public string? BackdropPath { get; set; }
}