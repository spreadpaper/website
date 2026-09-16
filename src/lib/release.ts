/** Stands in when the API is unreachable, so an offline build writes real figures. */
const FALLBACK: Release = { version: '1.10.1', size: '74 MB' }

/** The facts the download card quotes: which build it offers and how big it is. */
export type Release = {
  /** The tag with any leading `v` removed, so it reads as a version and not a ref. */
  version: string
  /** The disk image, rounded the way a person says it out loud. */
  size: string
}

let cached: Release | undefined

/**
 * Renders a byte count the way the download card quotes it. Rounds to whole
 * megabytes, since a tenth of one is noise next to a button.
 *
 * @param bytes - Size as GitHub reports it.
 * @returns A string like `74 MB`.
 */
function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`
}

/**
 * Reads the latest release once per build, so the hero can name the version it
 * offers and its size without costing the reader a request. Rate limits and
 * outages fall back rather than failing the build.
 *
 * @returns The version and download size, from the API or the fallback.
 */
export async function latestRelease(): Promise<Release> {
  if (cached !== undefined) return cached

  cached = FALLBACK
  try {
    const res = await fetch('https://api.github.com/repos/spreadpaper/SpreadPaper/releases/latest', {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'spreadpaper-site' },
    })
    if (!res.ok) return cached

    const release = (await res.json()) as {
      tag_name?: unknown
      assets?: { name?: unknown; size?: unknown }[]
    }

    const tag = typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/, '') : ''
    // The DMG is what the button hands over, so it is the number to quote.
    const dmg = release.assets?.find((asset) => typeof asset.name === 'string' && asset.name.endsWith('.dmg'))
    const bytes = dmg && typeof dmg.size === 'number' ? dmg.size : 0

    if (tag) cached = { version: tag, size: bytes > 0 ? megabytes(bytes) : cached.size }
  } catch {
    // Offline or rate limited: the fallback stands.
  }

  return cached
}
