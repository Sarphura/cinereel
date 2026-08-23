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
            .HasMaxLength(64)
            .IsRequired();
        builder.HasIndex(drive => drive.Key).IsUnique();

        builder.Property(drive => drive.Name)
            .HasMaxLength(DriveName.MaxLength)
            .IsRequired();
        builder.Property(drive => drive.ContentTypeId)
            .HasMaxLength(200)
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
