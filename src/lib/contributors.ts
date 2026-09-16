/** Everyone seen last time the API answered, so an offline build still credits them. */
const FALLBACK: Contributor[] = [
  { user: 'rvanbaalen', commits: 186 },
  { user: 'Grumpicus', commits: 1 },
  { user: 'jinixx', commits: 0 },
  { user: 'joryan44', commits: 0 },
  { user: 'lklynet', commits: 0 },
  { user: 'samuelmburu', commits: 0 },
  { user: 'ZappedC64', commits: 0 },
]

/** One person credited on the about page. */
export type Contributor = {
  /** GitHub login, which is also the avatar and profile path. */
  user: string
  /** Commits merged, or zero for someone who arrived through the issue tracker. */
  commits: number
}

const REPO = 'https://api.github.com/repos/spreadpaper/SpreadPaper'
const HEADERS = { accept: 'application/vnd.github+json', 'user-agent': 'spreadpaper-site' }
const PER_PAGE = 100

let cached: Contributor[] | undefined

/**
 * Fetches one page of the API and hands back the parsed body. Any failure
 * resolves null, so a caller can fall back rather than throw.
 *
 * @param path - Path under the repository, starting with a slash.
 * @returns The parsed array, or null when the request did not succeed.
 */
async function get(path: string): Promise<unknown[] | null> {
  try {
    const res = await fetch(`${REPO}${path}`, { headers: HEADERS })
    if (!res.ok) return null
    const body = await res.json()
    return Array.isArray(body) ? body : null
  } catch {
    return null
  }
}

/**
 * Walks a paginated collection until a short page ends it. Capped at five
 * pages, which is well past this repository and bounds an offline build.
 *
 * @param path - Path under the repository, with its query but no page number.
 * @returns Every record gathered, or null when any page failed.
 */
async function getAll(path: string): Promise<unknown[] | null> {
  const all: unknown[] = []
  for (let page = 1; page <= 5; page += 1) {
    const batch = await get(`${path}&page=${page}`)
    /* A page short of the whole is a failure, not a smaller answer: half the
       issue tracker credits half the people who are owed it. */
    if (!batch) return null
    all.push(...batch)
    if (batch.length < PER_PAGE) break
  }
  return all
}

/**
 * Reads the login off a record shaped like a contributor or an issue.
 *
 * @param record - An element of either API response.
 * @param key - Where the login sits: a contributor carries it, an issue nests it.
 * @returns The login, or an empty string when the shape is not what we expect.
 */
function login(record: unknown, key: 'self' | 'user'): string {
  if (typeof record !== 'object' || record === null) return ''
  const holder = key === 'self' ? record : (record as { user?: unknown }).user
  if (typeof holder !== 'object' || holder === null) return ''
  const name = (holder as { login?: unknown }).login
  return typeof name === 'string' ? name : ''
}

/**
 * Everyone who has put something into SpreadPaper, read once per build. Code
 * contributors come from the contributors endpoint, and anyone who has opened
 * an issue or a pull request follows them, since a request that shipped is a
 * contribution too. Bots are dropped, and either call failing falls back.
 *
 * @returns The busiest committer first, then the rest by login.
 */
export async function contributors(): Promise<Contributor[]> {
  if (cached !== undefined) return cached

  cached = FALLBACK

  const [code, issues] = await Promise.all([
    get(`/contributors?per_page=${PER_PAGE}`),
    getAll(`/issues?state=all&per_page=${PER_PAGE}`),
  ])
  /* Both halves or neither. The issue tracker costs five requests against the
     one contributors costs, so it is the half a rate limited build loses, and
     the committers on their own are not the list. */
  if (!code || !issues) return cached

  const human = (user: string) => user !== '' && !user.endsWith('[bot]')

  const committers: Contributor[] = code
    .map((record) => ({
      user: login(record, 'self'),
      commits: Number((record as { contributions?: unknown }).contributions) || 0,
    }))
    .filter(({ user }) => human(user))
    .sort((a, b) => b.commits - a.commits)

  const seen = new Set(committers.map(({ user }) => user))
  const raised = issues.map((record) => login(record, 'user')).filter(human)
  const reporters: Contributor[] = [...new Set(raised)]
    .filter((user) => !seen.has(user))
    .sort((a, b) => a.localeCompare(b))
    .map((user) => ({ user, commits: 0 }))

  if (committers.length > 0) cached = [...committers, ...reporters]
  return cached
}
