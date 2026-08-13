/**
 * TestController — `/v1/_test/*` HTTP routes (test-only).
 *
 * Production binaries cannot expose these (each handler short-circuits
 * when NODE_ENV === 'production').
 *
 * We push synthetic connection objects into the underlying Hyperswarm's
 * `connections` Set so that `SwarmService.getPeers()` reflects them.
 * The official hyper-sdk does not expose a public add/delete API; this
 * test surface reaches into the Set directly.
 */
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'
import { ZodValidationPipe } from 'nestjs-zod'
import { SDK_HANDLE } from '../../../hyper.domain/bootstrap/bootstrap.module.js'
import type { SDK } from '../../../hyper.infrastructure/types/hyperdrive.js'

interface SyntheticConnection {
  remotePublicKey: Buffer
  on: (event: 'close', cb: () => void) => unknown
}

function buildSyntheticConnection(publicKeyHex: string): SyntheticConnection {
  return {
    remotePublicKey: Buffer.from(publicKeyHex, 'hex'),
    on: () => ({}),
  }
}

const InjectPeerSchema = z.object({ publicKey: z.string().regex(/^[0-9a-f]{64}$/) })
const Hex64ParamSchema = z.object({ publicKey: z.string().regex(/^[0-9a-f]{64}$/) })

@ApiTags('test')
@Controller('v1/_test')
export class TestController {
  constructor(@Inject(SDK_HANDLE) private readonly sdk: SDK) {}

  @Post('peer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'testInjectPeer' })
  injectPeer(
    @Body(new ZodValidationPipe(InjectPeerSchema)) body: z.infer<typeof InjectPeerSchema>,
  ): { ok: true; peerCount: number } {
    const connections = this.sdk.connections as unknown as Set<SyntheticConnection>
    if (process.env.NODE_ENV === 'production') {
      return { ok: true, peerCount: connections.size }
    }
    const buf = Buffer.from(body.publicKey, 'hex')
    for (const conn of connections) {
      if (conn.remotePublicKey.equals(buf)) {
        return { ok: true, peerCount: connections.size }
      }
    }
    connections.add(buildSyntheticConnection(body.publicKey))
    return { ok: true, peerCount: connections.size }
  }

  @Delete('peer/:publicKey')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'testRemovePeer' })
  removePeer(
    @Param(new ZodValidationPipe(Hex64ParamSchema)) params: z.infer<typeof Hex64ParamSchema>,
  ): { ok: true; peerCount: number } {
    const buf = Buffer.from(params.publicKey, 'hex')
    const connections = this.sdk.connections as unknown as Set<SyntheticConnection>
    for (const conn of connections) {
      if (conn.remotePublicKey.equals(buf)) {
        connections.delete(conn)
        break
      }
    }
    return { ok: true, peerCount: connections.size }
  }
}
