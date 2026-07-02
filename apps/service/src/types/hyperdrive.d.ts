declare module 'hyperdrive' {
  export interface HyperdriveEntry {
    seq: number
    key: string
    value: {
      executable: boolean
      linkname: string | null
      blob: {
        blockOffset: number
        blockLength: number
        byteOffset: number
        byteLength: number
      } | null
      metadata: Record<string, any> | null
    }
  }

  export interface HyperdriveOptions {
    sparse?: boolean
  }

  export default class Hyperdrive {
    constructor(store: any, key?: string | Buffer | null, options?: HyperdriveOptions)

    key: Buffer | null
    discoveryKey: Buffer | null
    core: any
    
    ready(): Promise<void>
    close(): Promise<void>
    update(): Promise<boolean>

    entry(path: string, options?: { wait?: boolean }): Promise<HyperdriveEntry | null>
    get(path: string, options?: { wait?: boolean }): Promise<Buffer | null>
    put(path: string, buffer: Buffer | string): Promise<void>
    del(path: string): Promise<void>
    clear(path: string): Promise<void>
    purge(path?: string): Promise<void>

    list(prefix: string, options?: { wait?: boolean }): AsyncIterable<HyperdriveEntry>
    readdir(path: string): AsyncIterable<string>
  }
}
