using Cinereel.Base.Domain;

namespace Cinereel.Features.File;
public class FileEntity : FullTrackedEntity
{
    public string Name { get; set; } = null!;
    public string Path { get; set; } = null!;
    public long Size { get; set; }
}