using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Cinereel.Features.Torrent.Entity;

public sealed class TorrentJobEntityConfiguration : IEntityTypeConfiguration<TorrentJobEntity>
{
    public void Configure(EntityTypeBuilder<TorrentJobEntity> builder)
    {
        builder.ToTable("TorrentJobs");
        builder.HasIndex(job => job.InfoHash).IsUnique();

        builder.Property(job => job.Kind).HasConversion<string>().HasMaxLength(16);
        builder.Property(job => job.InfoHash).HasMaxLength(64);
        builder.Property(job => job.Source).HasMaxLength(2048);
        builder.Property(job => job.TorrentFilePath).HasMaxLength(1024);
        builder.Property(job => job.SavePath).HasMaxLength(1024);
    }
}
