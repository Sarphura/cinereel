namespace Cinereel.Features.Movie;

public sealed class CreateMovieRequestDto
{
    public string Title { get; set; } = null!;
    public string Description { get; set; } = null!;
    public int ReleaseYear { get; set; }
    public string Director { get; set; } = null!;
    public string Genre { get; set; } = null!;
}