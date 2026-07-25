using CineReel.Service.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class DbContextTests
{
    [Fact]
    public async Task Initial_migration_creates_documented_schema_and_indices()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<CinereelDbContext>().UseSqlite(connection).Options;
        await using var db = new CinereelDbContext(options);
        await db.Database.MigrateAsync();

        var tables = await ReadNamesAsync(connection, "SELECT name FROM sqlite_master WHERE type='table'");
        Assert.Contains("subscriptions", tables);
        Assert.Contains("media_items", tables);
        Assert.Contains("torrent_files", tables);
        Assert.Contains("accounts", tables);
        Assert.Contains("sessions", tables);
        Assert.Contains("permissions", tables);

        var mediaColumns = await ReadNamesAsync(connection, "SELECT name FROM pragma_table_info('media_items')");
        Assert.Contains("descriptor_hash", mediaColumns);
        Assert.Contains("last_scanned_at", mediaColumns);

        var indices = await ReadNamesAsync(connection, "SELECT name FROM sqlite_master WHERE type='index'");
        Assert.Contains("idx_media_items_imdb", indices);
        Assert.Contains("idx_media_items_drive", indices);
        Assert.Contains("idx_sessions_account", indices);
        Assert.Contains("idx_sessions_expires", indices);
    }

    private static async Task<HashSet<string>> ReadNamesAsync(SqliteConnection connection, string sql)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        await using var reader = await command.ExecuteReaderAsync();
        var names = new HashSet<string>(StringComparer.Ordinal);
        while (await reader.ReadAsync())
        {
            names.Add(reader.GetString(0));
        }
        return names;
    }
}
