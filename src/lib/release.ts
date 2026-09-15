/** Last release seen, so a build with no network still writes real figures. */
const FALLBACK: Release = { version: '1.10.1', size: '74 MB' }

export type Release = {
  /** The tag with any leading `v` removed, so it reads as a version and not a ref. */
  version: string
  /** The disk image, rounded the way a person would say it out loud. */
  size: string
}

let cached: Release | undefined

/** GitHub reports bytes. Nobody reads bytes, and a tenth of a megabyte is noise. */
function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`
}

/**
 * The latest release, read once per build so the hero can say which version it is
 * offering and how big the download is without costing the reader a request.
 *
 * A failed or rate limited request falls back rather than failing the build, since
 * the site has to keep deploying offline. Unlike the star count nothing refreshes
 * this in the page, so the fallback is updated whenever it drifts far enough to
 * matter, which is what the test guards.
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
