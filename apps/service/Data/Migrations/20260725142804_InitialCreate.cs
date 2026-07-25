using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CineReel.Service.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "accounts",
                columns: table => new
                {
                    id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    username = table.Column<string>(type: "TEXT", nullable: false),
                    password_hash = table.Column<string>(type: "TEXT", nullable: false),
                    is_admin = table.Column<bool>(type: "INTEGER", nullable: false),
                    permissions = table.Column<string>(type: "TEXT", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    last_login_at = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    enabled = table.Column<bool>(type: "INTEGER", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_accounts", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "permissions",
                columns: table => new
                {
                    id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    account_id = table.Column<int>(type: "INTEGER", nullable: false),
                    pattern = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_permissions", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "subscriptions",
                columns: table => new
                {
                    id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    drive_key = table.Column<string>(type: "TEXT", nullable: false),
                    alias = table.Column<string>(type: "TEXT", nullable: true),
                    state = table.Column<string>(type: "TEXT", nullable: false),
                    failure_reason = table.Column<string>(type: "TEXT", nullable: true),
                    subscribed_at = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    last_synced_at = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    last_descriptor_seen_at = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    last_remounted_at = table.Column<DateTimeOffset>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_subscriptions", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "sessions",
                columns: table => new
                {
                    token = table.Column<string>(type: "TEXT", nullable: false),
                    account_id = table.Column<int>(type: "INTEGER", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    last_used_at = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    ip_address = table.Column<string>(type: "TEXT", nullable: true),
                    user_agent = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sessions", x => x.token);
                    table.ForeignKey(
                        name: "FK_sessions_accounts_account_id",
                        column: x => x.account_id,
                        principalTable: "accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "media_items",
                columns: table => new
                {
                    id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    subscription_id = table.Column<int>(type: "INTEGER", nullable: false),
                    drive_key = table.Column<string>(type: "TEXT", nullable: false),
                    drive_path = table.Column<string>(type: "TEXT", nullable: false),
                    descriptor_hash = table.Column<string>(type: "TEXT", nullable: false),
                    imdb_id = table.Column<string>(type: "TEXT", nullable: true),
                    title = table.Column<string>(type: "TEXT", nullable: false),
                    original_title = table.Column<string>(type: "TEXT", nullable: true),
                    year = table.Column<int>(type: "INTEGER", nullable: true),
                    kind = table.Column<string>(type: "TEXT", nullable: false),
                    poster_path = table.Column<string>(type: "TEXT", nullable: true),
                    nfo_path = table.Column<string>(type: "TEXT", nullable: true),
                    torrent_path = table.Column<string>(type: "TEXT", nullable: false),
                    trailer_path = table.Column<string>(type: "TEXT", nullable: true),
                    last_scanned_at = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    jellyfin_state = table.Column<string>(type: "TEXT", nullable: false),
                    jellyfin_path = table.Column<string>(type: "TEXT", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_media_items", x => x.id);
                    table.ForeignKey(
                        name: "FK_media_items_subscriptions_subscription_id",
                        column: x => x.subscription_id,
                        principalTable: "subscriptions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "torrent_files",
                columns: table => new
                {
                    media_item_id = table.Column<int>(type: "INTEGER", nullable: false),
                    infohash = table.Column<string>(type: "TEXT", nullable: false),
                    total_bytes = table.Column<long>(type: "INTEGER", nullable: false),
                    staged_bytes = table.Column<long>(type: "INTEGER", nullable: false, defaultValue: 0L),
                    bt_state = table.Column<string>(type: "TEXT", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_torrent_files", x => x.media_item_id);
                    table.ForeignKey(
                        name: "FK_torrent_files_media_items_media_item_id",
                        column: x => x.media_item_id,
                        principalTable: "media_items",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_accounts_username",
                table: "accounts",
                column: "username",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "idx_media_items_drive",
                table: "media_items",
                columns: new[] { "drive_key", "drive_path" });

            migrationBuilder.CreateIndex(
                name: "idx_media_items_imdb",
                table: "media_items",
                column: "imdb_id");

            migrationBuilder.CreateIndex(
                name: "idx_media_items_jellyfin_state",
                table: "media_items",
                column: "jellyfin_state");

            migrationBuilder.CreateIndex(
                name: "IX_media_items_subscription_id_drive_path",
                table: "media_items",
                columns: new[] { "subscription_id", "drive_path" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_permissions_account_id_pattern",
                table: "permissions",
                columns: new[] { "account_id", "pattern" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "idx_sessions_account",
                table: "sessions",
                column: "account_id");

            migrationBuilder.CreateIndex(
                name: "idx_sessions_expires",
                table: "sessions",
                column: "expires_at");

            migrationBuilder.CreateIndex(
                name: "idx_subscriptions_state",
                table: "subscriptions",
                column: "state");

            migrationBuilder.CreateIndex(
                name: "IX_subscriptions_drive_key",
                table: "subscriptions",
                column: "drive_key",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "permissions");

            migrationBuilder.DropTable(
                name: "sessions");

            migrationBuilder.DropTable(
                name: "torrent_files");

            migrationBuilder.DropTable(
                name: "accounts");

            migrationBuilder.DropTable(
                name: "media_items");

            migrationBuilder.DropTable(
                name: "subscriptions");
        }
    }
}
