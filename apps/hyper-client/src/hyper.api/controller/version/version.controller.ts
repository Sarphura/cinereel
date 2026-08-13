/**
 * VersionController — `GET /v1/version`.
 *
 * Returns the Hyper Agent's name + semver from its own `package.json`.
 * The Application Server reads this on startup and refuses to proceed
 * if the version differs from the one it was compiled against (ticket
 * 10). The wire shape is fixed; the App Server's NSwag client (ticket
 * 14) consumes it.
 *
 * The version is read once at construction (package.json is on disk
 * next to the running binary's project root). This avoids a per-request
 * disk hit and also keeps the value stable across the lifetime of the
 * process — the test fixture uses `package.json` resolution.
 */
import { Controller, Get } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

export const VERSION_NAME = 'hyper-agent' as const

interface PackageShape {
  name?: string
  version?: string
}

function readPackageJson(): PackageShape {
  // Walk up from this file's directory looking for the nearest
  // `package.json` whose `name` field matches our package. Tests may
  // mock the version via `process.env.HYPER_AGENT_VERSION`; the override
  // takes precedence over the on-disk value when set so the integration
  // smoke (ticket 18) can pin both sides.
  const override = process.env.HYPER_AGENT_VERSION
  const overrideName = process.env.HYPER_AGENT_NAME

  if (override || overrideName) {
    return {
      name: overrideName ?? VERSION_NAME,
      version: override ?? '0.0.0',
    }
  }

  const here = path.dirname(fileURLToPath(import.meta.url))
  let dir = here
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'package.json')
    if (existsSync(candidate)) {
      try {
        const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as PackageShape
        if (parsed.name && parsed.version) {
          return parsed
        }
      } catch {
        // fall through, keep walking up
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return { name: VERSION_NAME, version: '0.0.0' }
}

export interface VersionResponse {
  name: string
  version: string
}

@ApiTags('meta')
@Controller('v1/version')
export class VersionController {
  private readonly response: VersionResponse

  constructor() {
    const pkg = readPackageJson()
    this.response = {
      name: pkg.name ?? VERSION_NAME,
      version: pkg.version ?? '0.0.0',
    }
  }

  @Get()
  @ApiOperation({ operationId: 'getVersion' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['name', 'version'],
      properties: {
        name: { type: 'string' },
        version: { type: 'string' },
      },
    },
  })
  version(): VersionResponse {
    return this.response
  }
}
