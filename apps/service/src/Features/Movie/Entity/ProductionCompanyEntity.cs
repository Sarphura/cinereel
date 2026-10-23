using System.Text.Json.Serialization;
using Cinereel.Base.Domain;
namespace Cinereel.Features.Movie.Entity;

public class ProductionCompanyEntity : FullTrackedEntity
{
    public string Name { get; set; } = null!;
    public string? LogoPath { get; set; }
    public string? OriginCountry { get; set; }
}