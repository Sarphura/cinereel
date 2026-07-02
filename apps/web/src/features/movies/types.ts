export interface MediaStreamRecord {
  codec: string | null;
  profile?: string | null;
  language?: string | null;
  title?: string | null;
  bitRate?: number | null;
}

export interface MediaVideoRecord extends MediaStreamRecord {
  width: number | null;
  height: number | null;
  frameRate: number | null;
  level: number | null;
  bitDepth: number | null;
  hdr: string | null;
  colorPrimaries?: string | null;
  colorTransfer?: string | null;
  colorSpace?: string | null;
}

export interface MediaAudioRecord extends MediaStreamRecord {
  channels: number | null;
  channelLayout?: string | null;
  sampleRate?: number | null;
}

export interface MediaSubtitleRecord extends MediaStreamRecord {
  forced?: boolean;
  default?: boolean;
}

export interface MediaIndexEntry {
  path: string;
  fileName: string;
  container: string | null;
  size: number | null;
  durationSeconds: number | null;
  bitRate: number | null;
  video: MediaVideoRecord[];
  audio: MediaAudioRecord[];
  subtitles: MediaSubtitleRecord[];
  scannedAt: number;
  metadata?: MediaMetadataRecord | null;
}

export interface MediaMetadataRecord {
  title?: string | null;
  originalTitle?: string | null;
  plot?: string | null;
  year?: number | null;
  premiered?: string | null;
  rating?: number | null;
  posterPath?: string | null;
  fanartPath?: string | null;
  nfoPath?: string | null;
}

export interface MovieRecord {
  driveKey: string;
  resourcePath: string;
  title?: string;
  originalTitle?: string;
  plot?: string;
  year?: number;
  premiered?: string;
  rating?: number;
  posterPath?: string;
  fanartPath?: string;
  nfoPath?: string;
  indexedAt: number;
}

export interface MediaIndexResponse {
  version: number;
  driveKey: string;
  path: string | null;
  total: number;
  items: MediaIndexEntry[];
}
