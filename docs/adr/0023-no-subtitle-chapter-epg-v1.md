# V1 ships no subtitle, chapter, EPG, or multi-language NFO support

The .NET Application Server does not parse, push, or generate subtitle / chapter / EPG / multi-language metadata in V1. The Cinereel scope is "drive → poster wall → Jellyfin playback". Subtitles and chapters are Jellyfin's domain once the video file is on disk. EPG is for live TV, which is out of scope. Multi-language UI is a `apps/web` i18n question, not an NFO parsing question.

## Context

Subtitles, chapter markers, and EPG (Electronic Program Guide) are common video metadata types. The risk is conflating Cinereel's job (deliver the right video bytes with the right metadata to Jellyfin) with Jellyfin's job (manage playback metadata for the local library).

## Decision

V1 explicitly excludes:

- **Subtitle**: Jellyfin ships an OpenSubtitles plugin and an internal subtitle resolver that runs against the local library. Pushing pre-staged subtitle files from Cinereel would only duplicate Jellyfin's behavior. If a Cinereel-pushed video file has companion `.srt` or `.ass` files in the same drive folder, they will be picked up by Jellyfin automatically because we copy them into the staging directory along with the video.
- **Chapter**: chapter markers live inside the `.mkv` / `.mp4` container. Cinereel doesn't process container formats; the chapter info flows naturally with the video file.
- **EPG**: live TV / EPG is out of scope. Cinereel is a personal library product.

If a future version needs subtitle pushing (e.g. for offline Cinereel-fronted playback without Jellyfin), this ADR will be revisited.

## Trade-off accepted

- The Cinereel web frontend cannot preview subtitles without Jellyfin. Acceptable because V1's preview surface is the poster wall + trailer preview only.
- A user who explicitly wants Cinereel-staged subtitles must either rely on Jellyfin's resolver or open an issue requesting this feature.
- The NFO parser reads only `<title>` and `<originaltitle>` (per ADR 0012). Localised display in `apps/web` is a UI i18n problem, addressed in V2.
