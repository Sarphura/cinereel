# On first startup, Cinereel creates a bootstrap admin account and one empty "Demo" resource drive

When the App Server starts with no existing `accounts` row, it runs a one-time bootstrap sequence:

1. Generate a random admin password (16 characters, alphanumeric) and write it to `<CINEREEL_DATA_DIR>/bootstrap-admin.txt` (mode 0600).
2. Insert an `accounts` row with `username = "admin"`, the Argon2id hash of the password, `permissions = ["*"]`, `is_admin = 1`.
3. Insert a `subscriptions` row for the local main drive (key derived from `MAIN_NAMESPACE`), and create an empty resource drive named "Demo" with `descriptor.json` declaring `{ name: "Demo", type: "metadata", ownerProfileKey: <main driveKey> }`.
4. Log a one-time message: "Bootstrap admin password written to `<path>`. Please change it after first login."

## Context

V1 is local-first; the operator (the user) needs to log in immediately on first launch. The question is how much "demo content" Cinereel ships with. Three plausible shapes:

- **Admin only** — no demo content.
- **Admin + empty demo drive** — admin + a placeholder drive the user can browse and delete.
- **Admin + populated demo drive** — admin + a drive with example NFO and a public-domain trailer.

## Decision

Admin + empty demo drive.

### Why an empty drive (not populated)

- A populated drive would ship copyrighted or unverified content.
- An empty drive is a working target the user can delete, rename, or modify.
- The "Demo" drive demonstrates the drive structure (folder hierarchy, descriptor.json) without any media.

### Bootstrap sequence

```csharp
public class BootstrapInitializer : IHostedService
{
  public async Task StartAsync(CancellationToken ct)
  {
    if (await db.Accounts.AnyAsync(ct)) return; // already bootstrapped

    // 1. Generate admin password
    var password = RandomPassword.Generate(16);
    await File.WriteAllTextAsync(Path.Combine(dataDir, "bootstrap-admin.txt"), password, ct);
    File.SetUnixFileMode(Path.Combine(dataDir, "bootstrap-admin.txt"), UnixFileMode.UserRead | UnixFileMode.UserWrite);

    // 2. Insert admin
    var admin = new Account {
      Username = "admin",
      PasswordHash = Argon2id.Hash(password),
      IsAdmin = true,
      Permissions = ["*"]
    };
    db.Accounts.Add(admin);
    await db.SaveChangesAsync(ct);

    // 3. Create Demo drive
    var demoDrive = await sidecar.CreateLocalDriveAsync("demo");
    await sidecar.WriteAsync(demoDrive.Uuid, "/descriptor.json",
      Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new {
        name = "Demo",
        type = "metadata",
        ownerProfileKey = mainDriveKey
      })));
    db.Subscriptions.Add(new Subscription {
      DriveKey = demoDrive.DriveKey,
      Type = "metadata",
      Status = "active"
    });
    await db.SaveChangesAsync(ct);

    logger.LogInformation("Bootstrap complete. Admin password at {Path}",
      Path.Combine(dataDir, "bootstrap-admin.txt"));
  }
}
```

### What the user sees

1. Open `http://nas:8090`.
2. Log in with `admin` and the password in `bootstrap-admin.txt`.
3. Land on the poster wall with one entry: "Demo" (no items, just the drive header).
4. The user is prompted to change the password on first login (separate ADR, ADR 0037's claim flow).
5. The user can publish a real drive, subscribe to a friend's drive, etc.

### What is NOT created

- A sample media item (movie.nfo + poster + .torrent).
- A sample subscription to a public Cinereel demo node.
- A sample Jellyfin library push.

### What's NOT in V1

- "First-run wizard" multi-step UI. The user is dropped straight into the poster wall.
- Auto-deletion of `bootstrap-admin.txt` after the user changes the password. The user must `rm` it manually.
- Account recovery flow. The user must keep `bootstrap-admin.txt` safe.

## Trade-off accepted

- An empty "Demo" drive is cosmetic clutter. Users can delete it.
- The bootstrap-admin.txt file persists until the user deletes it. We log a warning on every startup if the file still exists.
- The first-run UX is functional, not polished. V2 may add a wizard.