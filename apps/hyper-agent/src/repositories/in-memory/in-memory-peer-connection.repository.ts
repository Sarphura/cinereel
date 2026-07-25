/**
 * In-memory `PeerConnectionRepository` for tests.
 */
import type { PeerConnection, PeerConnectionRepository } from '../peer-connection.repository.js'

export class InMemoryPeerConnectionRepository implements PeerConnectionRepository {
  private store: PeerConnection[] = []

  constructor(initial: PeerConnection[] = []) {
    this.store = [...initial]
  }

  list(): PeerConnection[] {
    return [...this.store]
  }

  count(): number {
    return this.store.length
  }

  /** Test helper — push a synthetic connection. */
  add(conn: PeerConnection): void {
    this.store.push(conn)
  }

  /** Test helper — remove a synthetic connection by public key. */
  removeByKey(publicKeyHex: string): void {
    const buf = Buffer.from(publicKeyHex, 'hex')
    this.store = this.store.filter((c) => !c.remotePublicKey.equals(buf))
  }
}