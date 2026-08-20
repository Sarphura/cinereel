using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Cinereel.Features.Drive;

internal sealed class DriveOwnershipEntityConfiguration :
    IEntityTypeConfiguration<DriveOwnershipEntity>
{
    public void Configure(EntityTypeBuilder<DriveOwnershipEntity> builder)
    {
        builder.ToTable("DriveOwnerships");
        builder.HasKey(ownership => ownership.DriveId);
        builder.Property(ownership => ownership.Remark).HasMaxLength(500);
    }
}
