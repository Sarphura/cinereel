# V1 has no per-node limits on resource drive count or storage; the operator's disk is the limit

The Cinereel Application Server does not enforce a maximum number of resource drives a single node can publish or mount. It does not enforce a maximum storage size. The OS's disk space is the only constraint.

## Context

Cinereel is local-first on a NAS. Typical users have 10-100 drives; storage budgets vary. Enforcing arbitrary limits would either be too lax to be useful (e.g. 1000 drives) or too strict (e.g. 10 drives for power users). Three plausible shapes:

- **No limit** — operator's disk is the limit. Pass-through to the OS.
- **Disk-space check only** — refuse to create a new drive when free space < 1 GB.
- **Count + disk limits** — refuse beyond N drives OR when disk space < X.

## Decision

No limits. The disk fills, the drive creation fails at the OS level.

### Why no limits

- A power user with a 100 TB NAS should not be capped at 100 drives.
- A user with 5 TB of movies should not be capped at 50 movies per drive.
- The OS already returns ENOSPC when disk is full. We don't need to re-implement.
- A `CreateDrive` API call that fails because the disk is full is a clear error message from MonoTorrent.

### What's logged

- Every drive creation logs its size in bytes.
- The `/health` endpoint reports `disk_space.free_gb` (ADR 0040) so operators can monitor.

### What's NOT in V1

- A `MaxDrives` config knob.
- A quota per application account.
- A subscription limit per resource drive.

## Trade-off accepted

- A user with a small disk may fill it up faster than expected. Mitigation: BT staging dir can be set to a different mount.
- The App Server doesn't surface "you're running out of disk" warnings proactively. Operators monitor via `/health`.