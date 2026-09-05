using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Cinereel.Features.Drive;

internal sealed class DriveEntityConfiguration : IEntityTypeConfiguration<DriveEntity>
{
    public void Configure(EntityTypeBuilder<DriveEntity> builder)
    {
        builder.ToTable("Drives");
        builder.HasKey(drive => drive.Id);

        builder.Property(drive => drive.Key)
            .HasMaxLength(64);
        builder.HasIndex(drive => drive.Key).IsUnique();

        builder.Property(drive => drive.Name)
            .HasMaxLength(DriveName.MaxLength)
            .IsRequired();
        builder.Property(drive => drive.ContentTypeId)
            .HasMaxLength(200)
            .IsRequired();
        builder.Property(drive => drive.Description)
            .HasMaxLength(DriveManifest.MaxDescriptionLength)
            .IsRequired();
        builder.Property(drive => drive.ManifestRevision);
        builder.Property(drive => drive.ManifestSyncedRevision);
        builder.Property(drive => drive.ManifestCreatedAt)
            .HasConversion(
                value => value.ToUnixTimeMilliseconds(),
                value => DateTimeOffset.FromUnixTimeMilliseconds(value));
        builder.Property(drive => drive.ManifestUpdatedAt)
            .HasConversion(
                value => value.ToUnixTimeMilliseconds(),
                value => DateTimeOffset.FromUnixTimeMilliseconds(value));
        builder.Property(drive => drive.ManifestErrorCode).HasMaxLength(64);
        builder.Property(drive => drive.ManifestAttempts);
        builder.Property(drive => drive.ManifestNextAttemptAt)
            .HasConversion(
                value => value.HasValue ? (long?)value.Value.ToUnixTimeMilliseconds() : null,
                value => value.HasValue ? DateTimeOffset.FromUnixTimeMilliseconds(value.Value) : null);
        builder.Property(drive => drive.IdempotencyKey)
            .HasMaxLength(IdempotencyKey.MaxLength);
        builder.HasIndex(drive => drive.IdempotencyKey).IsUnique();
        builder.Property(drive => drive.CreationRequestHash)
            .HasMaxLength(64);
        builder.Property(drive => drive.Status)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();
        builder.Property(drive => drive.RelationType)
            .IsRequired();
        builder.Property(drive => drive.Remark)
            .HasMaxLength(DriveRemark.MaxLength);
        builder.Property(drive => drive.CreatedAt)
            .HasConversion(
                value => value.ToUnixTimeMilliseconds(),
                value => DateTimeOffset.FromUnixTimeMilliseconds(value))
            .IsRequired();
        builder.Property(drive => drive.UpdatedAt)
            .HasConversion(
                value => value.ToUnixTimeMilliseconds(),
                value => DateTimeOffset.FromUnixTimeMilliseconds(value))
            .IsRequired();
    }
}
