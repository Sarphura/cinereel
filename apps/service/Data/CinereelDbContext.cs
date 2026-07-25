using System.Text.Json;
using CineReel.Service.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace CineReel.Service.Data;

public sealed class CinereelDbContext(DbContextOptions<CinereelDbContext> options) : DbContext(options)
{
    public DbSet<SubscriptionEntity> Subscriptions => Set<SubscriptionEntity>();
    public DbSet<MediaItemEntity> MediaItems => Set<MediaItemEntity>();
    public DbSet<TorrentFileEntity> TorrentFiles => Set<TorrentFileEntity>();
    public DbSet<AccountEntity> Accounts => Set<AccountEntity>();
    public DbSet<SessionEntity> Sessions => Set<SessionEntity>();
    public DbSet<PermissionEntity> Permissions => Set<PermissionEntity>();
    public DbSet<EntityFailureEntity> FailureEntries => Set<EntityFailureEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var subscriptions = modelBuilder.Entity<SubscriptionEntity>();
        subscriptions.ToTable("subscriptions");
        subscriptions.HasKey(x => x.Id);
        subscriptions.Property(x => x.Id).HasColumnName("id");
        subscriptions.Property(x => x.DriveKey).HasColumnName("drive_key").IsRequired();
        subscriptions.Property(x => x.Alias).HasColumnName("alias");
        subscriptions.Property(x => x.State).HasColumnName("state").HasConversion<string>().IsRequired();
        subscriptions.Property(x => x.FailureReason).HasColumnName("failure_reason");
        subscriptions.Property(x => x.SubscribedAt).HasColumnName("subscribed_at").IsRequired();
        subscriptions.Property(x => x.LastSyncedAt).HasColumnName("last_synced_at");
        subscriptions.Property(x => x.LastDescriptorSeenAt).HasColumnName("last_descriptor_seen_at");
        subscriptions.Property(x => x.LastRemountedAt).HasColumnName("last_remounted_at");
        subscriptions.HasIndex(x => x.DriveKey).IsUnique();
        subscriptions.HasIndex(x => x.State).HasDatabaseName("idx_subscriptions_state");

        var media = modelBuilder.Entity<MediaItemEntity>();
        media.ToTable("media_items");
        media.HasKey(x => x.Id);
        media.Property(x => x.Id).HasColumnName("id");
        media.Property(x => x.SubscriptionId).HasColumnName("subscription_id");
        media.Property(x => x.DriveKey).HasColumnName("drive_key").IsRequired();
        media.Property(x => x.DrivePath).HasColumnName("drive_path").IsRequired();
        media.Property(x => x.DescriptorHash).HasColumnName("descriptor_hash").IsRequired();
        media.Property(x => x.ImdbId).HasColumnName("imdb_id");
        media.Property(x => x.Title).HasColumnName("title").IsRequired();
        media.Property(x => x.OriginalTitle).HasColumnName("original_title");
        media.Property(x => x.Year).HasColumnName("year");
        media.Property(x => x.Kind).HasColumnName("kind").HasConversion<string>().IsRequired();
        media.Property(x => x.PosterPath).HasColumnName("poster_path");
        media.Property(x => x.NfoPath).HasColumnName("nfo_path");
        media.Property(x => x.TorrentPath).HasColumnName("torrent_path").IsRequired();
        media.Property(x => x.TrailerPath).HasColumnName("trailer_path");
        media.Property(x => x.LastScannedAt).HasColumnName("last_scanned_at");
        media.Property(x => x.JellyfinState).HasColumnName("jellyfin_state").HasConversion<string>().IsRequired();
        media.Property(x => x.JellyfinPath).HasColumnName("jellyfin_path");
        media.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        media.Property(x => x.UpdatedAt).HasColumnName("updated_at").IsRequired();
        media.HasIndex(x => x.ImdbId).HasDatabaseName("idx_media_items_imdb");
        media.HasIndex(x => new { x.DriveKey, x.DrivePath }).HasDatabaseName("idx_media_items_drive");
        media.HasIndex(x => x.JellyfinState).HasDatabaseName("idx_media_items_jellyfin_state");
        media.HasIndex(x => new { x.SubscriptionId, x.DrivePath }).IsUnique();
        media.HasOne(x => x.Subscription).WithMany(x => x.MediaItems).HasForeignKey(x => x.SubscriptionId).OnDelete(DeleteBehavior.Cascade);

        var torrents = modelBuilder.Entity<TorrentFileEntity>();
        torrents.ToTable("torrent_files");
        torrents.HasKey(x => x.MediaItemId);
        torrents.Property(x => x.MediaItemId).HasColumnName("media_item_id");
        torrents.Property(x => x.Infohash).HasColumnName("infohash").IsRequired();
        torrents.Property(x => x.TotalBytes).HasColumnName("total_bytes");
        torrents.Property(x => x.StagedBytes).HasColumnName("staged_bytes").HasDefaultValue(0L);
        torrents.Property(x => x.BtState).HasColumnName("bt_state").HasConversion<string>().IsRequired();
        torrents.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        torrents.Property(x => x.UpdatedAt).HasColumnName("updated_at").IsRequired();
        torrents.HasOne(x => x.MediaItem).WithOne(x => x.TorrentFile).HasForeignKey<TorrentFileEntity>(x => x.MediaItemId).OnDelete(DeleteBehavior.Cascade);

        var accounts = modelBuilder.Entity<AccountEntity>();
        accounts.ToTable("accounts");
        accounts.HasKey(x => x.Id);
        accounts.Property(x => x.Id).HasColumnName("id");
        accounts.Property(x => x.Username).HasColumnName("username").IsRequired();
        accounts.Property(x => x.PasswordHash).HasColumnName("password_hash").IsRequired();
        accounts.Property(x => x.IsAdmin).HasColumnName("is_admin");
        accounts.Property(x => x.Permissions).HasColumnName("permissions").HasConversion(
            value => JsonSerializer.Serialize(value, JsonSerializerOptions.Default),
            value => JsonSerializer.Deserialize<List<string>>(value, JsonSerializerOptions.Default) ?? new List<string>(),
            new Microsoft.EntityFrameworkCore.ChangeTracking.ValueComparer<List<string>>(
                (left, right) => left != null && right != null && left.SequenceEqual(right),
                value => value.Aggregate(0, (hash, item) => HashCode.Combine(hash, item.GetHashCode(StringComparison.Ordinal))),
                value => value.ToList())).IsRequired();
        accounts.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        accounts.Property(x => x.UpdatedAt).HasColumnName("updated_at").IsRequired();
        accounts.Property(x => x.LastLoginAt).HasColumnName("last_login_at");
        accounts.Property(x => x.Enabled).HasColumnName("enabled").HasDefaultValue(true);
        accounts.HasIndex(x => x.Username).IsUnique();

        var sessions = modelBuilder.Entity<SessionEntity>();
        sessions.ToTable("sessions");
        sessions.HasKey(x => x.Token);
        sessions.Property(x => x.Token).HasColumnName("token");
        sessions.Property(x => x.AccountId).HasColumnName("account_id");
        sessions.Property(x => x.CreatedAt).HasColumnName("created_at");
        sessions.Property(x => x.LastUsedAt).HasColumnName("last_used_at");
        sessions.Property(x => x.ExpiresAt).HasColumnName("expires_at");
        sessions.Property(x => x.IpAddress).HasColumnName("ip_address");
        sessions.Property(x => x.UserAgent).HasColumnName("user_agent");
        sessions.HasIndex(x => x.AccountId).HasDatabaseName("idx_sessions_account");
        sessions.HasIndex(x => x.ExpiresAt).HasDatabaseName("idx_sessions_expires");
        sessions.HasOne(x => x.Account).WithMany(x => x.Sessions).HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Cascade);

        var permissions = modelBuilder.Entity<PermissionEntity>();
        permissions.ToTable("permissions");
        permissions.HasKey(x => x.Id);
        permissions.Property(x => x.Id).HasColumnName("id");
        permissions.Property(x => x.AccountId).HasColumnName("account_id");
        permissions.Property(x => x.Pattern).HasColumnName("pattern").IsRequired();
        permissions.HasIndex(x => new { x.AccountId, x.Pattern }).IsUnique();

        var failures = modelBuilder.Entity<EntityFailureEntity>();
        failures.ToTable("entity_failures");
        failures.HasKey(x => x.Id);
        failures.Property(x => x.Id).HasColumnName("id");
        failures.Property(x => x.EntityType).HasColumnName("entity_type").IsRequired();
        failures.Property(x => x.EntityId).HasColumnName("entity_id").IsRequired();
        failures.Property(x => x.EventType).HasColumnName("event_type").IsRequired();
        failures.Property(x => x.Cause).HasColumnName("cause").IsRequired();
        failures.Property(x => x.LastAttemptedAt).HasColumnName("last_attempted_at").IsRequired();
        failures.HasIndex(x => new { x.EntityType, x.EntityId }).IsUnique();
    }
}
