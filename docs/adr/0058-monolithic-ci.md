# V1 CI is a single GitHub Actions workflow: build, test, lint, package, and release on tag

The Cinereel repository's CI is a single `.github/workflows/ci.yml` workflow that runs on every push to `main` and on every pull request. The workflow:

1. Sets up Node 22 and .NET 10.
2. Installs pnpm dependencies.
3. Builds the Sidecar (`pnpm --filter @cinereel/sidecar build`).
4. Builds the web UI (`pnpm --filter ui build`).
5. Builds the App Server (`dotnet build apps/service`).
6. Runs the Sidecar tests (`pnpm --filter @cinereel/sidecar test`).
7. Runs the web UI tests (`pnpm --filter ui test`).
8. Runs the App Server tests (`dotnet test apps/service`).
9. Runs the openapi-typescript codegen and checks the generated file into the commit (or fails the build on diff).
10. Runs `eslint` and `dotnet format --verify-no-changes`.
11. Builds the Docker image (`docker build -t cinereel:test .`).
12. Pushes to a registry on tagged commits (e.g. `v0.4.3` → `ghcr.io/owner/cinereel:0.4.3`).

## Context

V1 is a single repository with three apps. The question is how many CI workflows to maintain. Three plausible shapes:

- **Monolithic workflow** — one file, one job matrix. Easy to read.
- **Multi-pipeline** — separate `ci.yml`, `release.yml`, `nightly.yml`. Each focused.
- **Per-app workflows** — `sidecar.yml`, `service.yml`, `ui.yml`. Most parallel but most duplication.

## Decision

Single monolithic workflow for V1.

### Why single

- V1 has three apps that share infrastructure (the Docker image, the OpenAPI pipeline). Splitting requires coordinating the same image build across multiple files.
- A single workflow file is easier to debug in PR reviews.
- The matrix is small (3 apps × ~3-5 jobs) — well within GitHub Actions' reasonable file size.

### Workflow sketch

```yaml
name: CI
on:
  push:
    branches: [main]
    tags: ['v*']
  pull_request:
    branches: [main]

jobs:
  build-test:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: pnpm }
      - uses: pnpm/action-setup@v4
        with: { version: '10.25.0' }
      - uses: actions/setup-dotnet@v4
        with: { dotnet-version: '10.0.x' }
      - run: pnpm install --frozen-lockfile

      - name: Build sidecar
        run: pnpm --filter @cinereel/sidecar build

      - name: Build web
        run: pnpm --filter ui build

      - name: Build service
        run: dotnet build apps/service/CineReel.Service.csproj -c Release

      - name: Test sidecar
        run: pnpm --filter @cinereel/sidecar test

      - name: Test web
        run: pnpm --filter ui test

      - name: Test service
        run: dotnet test apps/service/CineReel.Service.csproj -c Release

      - name: Codegen check (app server)
        run: |
          # 1. Spin up a stub App Server returning the latest swagger.json
          # 2. Run openapi-typescript
          # 3. Diff generated file against committed version
          # 4. Fail if different
          bash scripts/check-web-codegen.sh

      - name: Lint
        run: pnpm run lint && dotnet format apps/service/ --verify-no-changes

      - name: Build docker
        run: docker build -t cinereel:test .

      - name: Push docker
        if: startsWith(github.ref, 'refs/tags/v')
        run: |
          echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin
          docker tag cinereel:test ghcr.io/${{ github.repository_owner }}/cinereel:${GITHUB_REF_NAME#v}
          docker push ghcr.io/${{ github.repository_owner }}/cinereel:${GITHUB_REF_NAME#v}
```

### Why openapi-typescript codegen check is in CI

ADR 0042 mandates build-time codegen. CI verifies that the committed generated file matches what the App Server's swagger.json produces. Drift fails the build.

### What's NOT in V1

- Per-app workflows (Sidecar can be built without App Server; web can be built without Sidecar). Single workflow builds everything.
- Nightly fuzz or long-running integration tests.
- Coverage thresholds — coverage is reported but not enforced.
- Dependabot / Renovate — operators update dependencies manually.

## Trade-off accepted

- The single workflow runs ~10 minutes. Acceptable for V1's scale.
- A failure in any job blocks the entire pipeline. Operators see all failures at once.
- Docker build runs on every PR, which is slow. Acceptable for V1; can move to a separate job later.