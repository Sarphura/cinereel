using Cinereel.Base.Domain;
namespace Cinereel.Features.Movie.Entity;

public class GenreEntity : FullTrackedEntity
{
    public string Name { get; set; } = null!;
}