using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Cinereel.Features.Drive;

internal sealed class DriveCreationOperationEntityConfiguration :
    IEntityTypeConfiguration<DriveCreationOperationEntity>
{
    public void Configure(EntityTypeBuilder<DriveCreationOperationEntity> builder)
    {
        builder.ToTable("DriveCreationOperations");
        builder.HasKey(operation => operation.IdempotencyKey);

        builder.Property(operation => operation.IdempotencyKey)
            .HasMaxLength(IdempotencyKey.MaxLength);
        builder.Property(operation => operation.RequestHash)
            .HasMaxLength(64)
            .IsRequired();
        builder.Property(operation => operation.DriveId).IsRequired();
        builder.HasIndex(operation => operation.DriveId).IsUnique();
        builder.Property(operation => operation.Name)
            .HasMaxLength(DriveName.MaxLength)
            .IsRequired();
        builder.Property(operation => operation.ContentTypeId)
            .HasMaxLength(200)
            .IsRequired();
        builder.Property(operation => operation.Status)
            .HasColumnName("State")
            .HasConversion<string>()
            .HasMaxLength(32);
        builder.Property(operation => operation.DriveKey).HasMaxLength(64);
        builder.Property(operation => operation.CompensationAttemptCount).IsRequired();
        builder.Property(operation => operation.CreatedAt)
            .HasConversion(
                value => value.ToUnixTimeMilliseconds(),
                value => DateTimeOffset.FromUnixTimeMilliseconds(value))
            .IsRequired();
        builder.Property(operation => operation.UpdatedAt)
            .HasConversion(
                value => value.ToUnixTimeMilliseconds(),
                value => DateTimeOffset.FromUnixTimeMilliseconds(value))
            .IsRequired();
    }
}
