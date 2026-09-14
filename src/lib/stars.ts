/** Last count seen, so a build with no network still writes a real number. */
const FALLBACK = 86

let cached: number | undefined

/**
 * The repository's star count, read once per build so the number is right without
 * JavaScript and costs the reader no request. Every caller after the first gets
 * the cached value, so a page with two star buttons still makes one call.
 *
 * A failed or rate limited request falls back rather than failing the build, since
 * the site has to keep deploying offline. `setupStarCount` in the page script
 * refreshes whatever is written here, so this only has to be close.
 */
export async function starCount(): Promise<number> {
  if (cached !== undefined) return cached

  cached = FALLBACK
  try {
    const res = await fetch('https://api.github.com/repos/spreadpaper/SpreadPaper', {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'spreadpaper-site' },
    })
    if (!res.ok) return cached
    const { stargazers_count: stars } = (await res.json()) as { stargazers_count?: unknown }
    if (Number.isInteger(stars)) cached = stars as number
  } catch {
    // Offline or rate limited: the fallback stands.
  }

  return cached
}
