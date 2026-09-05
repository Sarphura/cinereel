using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Cinereel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDriveManifest : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "Drives",
                type: "TEXT",
                maxLength: 4000,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "ManifestAttempts",
                table: "Drives",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<long>(
                name: "ManifestCreatedAt",
                table: "Drives",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<string>(
                name: "ManifestErrorCode",
                table: "Drives",
                type: "TEXT",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "ManifestNextAttemptAt",
                table: "Drives",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "ManifestRevision",
                table: "Drives",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<long>(
                name: "ManifestSyncedRevision",
                table: "Drives",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<long>(
                name: "ManifestUpdatedAt",
                table: "Drives",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0L);

            // 既有自有 Drive 补入持久化同步队列，不改变创建生命周期或私有备注。
            migrationBuilder.Sql("""
                UPDATE "Drives"
                SET "ManifestCreatedAt" = "CreatedAt",
                    "ManifestUpdatedAt" = "CreatedAt",
                    "ManifestRevision" = CASE
                        WHEN "RelationType" = 1 AND "Status" <> 'Deleted' THEN 1
                        ELSE 0 END;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Description",
                table: "Drives");

            migrationBuilder.DropColumn(
                name: "ManifestAttempts",
                table: "Drives");

            migrationBuilder.DropColumn(
                name: "ManifestCreatedAt",
                table: "Drives");

            migrationBuilder.DropColumn(
                name: "ManifestErrorCode",
                table: "Drives");

            migrationBuilder.DropColumn(
                name: "ManifestNextAttemptAt",
                table: "Drives");

            migrationBuilder.DropColumn(
                name: "ManifestRevision",
                table: "Drives");

            migrationBuilder.DropColumn(
                name: "ManifestSyncedRevision",
                table: "Drives");

            migrationBuilder.DropColumn(
                name: "ManifestUpdatedAt",
                table: "Drives");
        }
    }
}
