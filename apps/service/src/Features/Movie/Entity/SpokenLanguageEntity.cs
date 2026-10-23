using System.Text.Json.Serialization;
using Cinereel.Base.Domain;
namespace Cinereel.Features.Movie.Entity;

public class SpokenLanguageEntity : FullTrackedEntity
{
    [JsonPropertyName("iso_639_1")]
    public string? Iso6391 { get; set; }

    [JsonPropertyName("english_name")]
    public string? EnglishName { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = null!;
}