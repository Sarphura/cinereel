# 13 — Delete the old /v1/drives/:key/file?path= read path (contract)

**What to build:** The Hyper Agent removes the `GET /v1/drives/:key/file?path=` read route entirely. Only `PUT` and `DELETE` on `/v1/drives/:key/file` remain (writes and deletes still belong there). The .NET Application Server no longer calls the old read operation. The NSwag client is regenerated and only exposes the new path.

**Blocked by:** 12 (every caller must be on the new path before the old path can go)

**Status:** ready-for-agent

- [ ] `DrivesController.readFile` is removed; the route no longer responds
- [ ] A supertest against the deleted route returns 404 (route not found) — confirms the controller method is gone, not just renamed
- [ ] The NSwag client is regenerated; the old `driveReadFile` method no longer exists in `apps/service/src/HyperAgent/HyperAgentClient.g.cs`
- [ ] The App Server builds and runs end-to-end on the regenerated client
- [ ] PUT and DELETE on `/v1/drives/:key/file` remain live and unchanged
