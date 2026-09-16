/**
 * Drives the built page in a DOM and asserts how it behaves, which reading the
 * markup cannot tell you. Both bugs found this way read correctly in
 * source and behaved wrongly in the browser.
 *
 * Run with `npm test`, which builds first. Assertions belong here whenever a
 * section's CSS depends on how this script hides something, since that
 * coupling is invisible from either file on its own.
 *
 * WHAT THIS CANNOT TEST. jsdom drops every rule inside `@layer`, and Tailwind
 * puts all of preflight there, so `getComputedStyle` answers as though half the
 * stylesheet does not exist. It reported a section's `display` override winning
 * a fight it actually loses to preflight's `!important`. So assert attributes,
 * classes and inline styles, which are real, and never a computed style or
 * anything resolved through the cascade: those come back confidently wrong.
 * jsdom also has no layout, so every measurement is zero. A rule about which
 * of two stylesheet declarations wins has to be checked in a browser.
 *
 * Two metrics are stood in for, where a bug turns on the moment one is read:
 * `offsetWidth` and `offsetLeft` below, and the canvas box in the drag section.
 * Each stub carries one browser rule and nothing else.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { people } from '../src/lib/count.ts'

const site = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const html = readFileSync(join(site, 'index.html'), 'utf8')
// Astro emits a script as a file, or inlines it once it drops under 4KB, and
// the homepage carries two. Take every one: picking one tests whichever Astro
// happened to put first and skips the other in silence.
const bundles = [
  ...readdirSync(join(site, '_astro'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(site, '_astro', f), 'utf8')),
  ...[...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]),
]

// The compiled stylesheets, for the rules that have to survive the build in a
// particular shape rather than merely exist in a source file.
const styles = readdirSync(join(site, '_astro'))
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(join(site, '_astro', f), 'utf8'))
  .join('\n')

let failures = 0
const check = (name: string, condition: unknown, detail = '') => {
  if (condition) console.log(`  pass  ${name}`)
  else {
    failures++
    console.log(`  FAIL  ${name} ${detail}`)
  }
}

const { window } = new JSDOM(html, { pretendToBeVisual: true, runScripts: 'outside-only' })
const doc = window.document

// jsdom ships neither of these; the nav and the reveal both reach for them.
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList
/** Just enough of an IntersectionObserver to hold the entries and replay them. */
type FakeObserver = {
  callback: (entries: { target: Element; isIntersecting: boolean }[]) => void
  options: IntersectionObserverInit | undefined
  targets: Element[]
}
const observers: FakeObserver[] = []
window.IntersectionObserver = class {
  callback: FakeObserver['callback']
  options: IntersectionObserverInit | undefined
  targets: Element[]
  constructor(callback: FakeObserver['callback'], options?: IntersectionObserverInit) {
    this.callback = callback
    this.options = options
    this.targets = []
    observers.push(this)
  }
  observe(target: Element) {
    this.targets.push(target)
  }
  unobserve() {}
  disconnect() {}
} as unknown as typeof window.IntersectionObserver

const slider = doc.querySelector<HTMLInputElement>('[data-bezel-slider]')!
const control = doc.querySelector('[data-bezel-control]')!
const readout = doc.querySelector('[data-bezel-readout]')!
const rig = slider && doc.getElementById(slider.dataset.bezelTarget!)!
const tabRoot = doc.querySelector('[data-tabs]')!
const benchMount = doc.querySelector('[data-bench-mount]')!
const benchStill = doc.querySelector('[data-bench-still]')!
const tabList = tabRoot && tabRoot.querySelector('[data-tabs-list]')!

console.log('with no script, the page is still complete')
check('bezel control ships hidden', control?.hasAttribute('hidden'))
check('tab list ships hidden', tabList?.hasAttribute('hidden'))
const tabsBefore = tabList ? [...tabList.querySelectorAll<HTMLElement>('[role="tab"]')] : []
const panelsBefore = tabsBefore.map((tab) => doc.getElementById(tab.getAttribute('aria-controls')!)!)
check('every tab panel is readable', panelsBefore.length > 0 && panelsBefore.every((p) => p && !p.hasAttribute('inert')))
check('no panel sits in the tab order yet', panelsBefore.every((p) => !p.hasAttribute('tabindex')))
check('nav menu links exist in the markup', doc.querySelectorAll('#nav-menu a').length > 0)
check('no tabs-ready flag before the script', !tabRoot?.hasAttribute('data-tabs-ready'))
check('the editor bench ships empty and hidden', benchMount?.hasAttribute('hidden') && !benchMount.innerHTML.trim())
check('and the still canvas it replaces is showing', !benchStill?.hasAttribute('hidden'))

/* jsdom has no layout, so every metric reads zero and a measurement taken at
   the wrong moment looks the same as one taken at the right one. This is the
   single rule the bench depends on: a box inside a `hidden` subtree has no
   size, and a box that is laid out has one. */
const LAID_OUT = 64
for (const metric of ['offsetWidth', 'offsetLeft']) {
  Object.defineProperty(window.HTMLElement.prototype, metric, {
    configurable: true,
    get(this: HTMLElement) {
      return this.closest('[hidden]') ? 0 : LAID_OUT
    },
  })
}

// Each in its own scope: two modules declaring the same name is ordinary in the
// browser and should not become an error only in here.
bundles.forEach((source) => window.eval(`(function () {\n${source}\n})()`))

/* What the segmented thumb measured on load, read before anything touches the
   bench. Every later render measures it again, so a width taken further down
   the file passes whether or not the first one found a hidden box. */
const thumbOnLoad = doc.querySelector<HTMLElement>('[data-seg-thumb]')!.style.width

const panels0 = panelsBefore

console.log('\nbezel slider')
const startValue = slider.value
check('control is revealed', !control.hasAttribute('hidden'))
check('property matches the slider on load', rig.style.getPropertyValue(slider.dataset.bezelProp!) === startValue,
  `got "${rig.style.getPropertyValue(slider.dataset.bezelProp!)}" want "${startValue}"`)
check('readout agrees on load', readout.textContent === `${startValue}${slider.dataset.bezelUnit}`,
  `got "${readout.textContent}"`)
check('readout is hidden from assistive tech', readout.getAttribute('aria-hidden') === 'true')
check('slider speaks its unit', slider.getAttribute('aria-valuetext') === `${startValue} points`,
  `got "${slider.getAttribute('aria-valuetext')}"`)

slider.value = '75'
slider.dispatchEvent(new window.Event('input', { bubbles: true }))
check('property follows the drag', rig.style.getPropertyValue(slider.dataset.bezelProp!) === '75',
  `got "${rig.style.getPropertyValue(slider.dataset.bezelProp!)}"`)
check('readout follows the drag', readout.textContent === '75 pt', `got "${readout.textContent}"`)
check('spoken value follows the drag', slider.getAttribute('aria-valuetext') === '75 points')
check('property stays unitless, so the section composes the unit',
  !/[a-z%]/i.test(rig.style.getPropertyValue(slider.dataset.bezelProp!)))

slider.value = slider.max
slider.dispatchEvent(new window.Event('input', { bubbles: true }))
check('the far end of the range applies', rig.style.getPropertyValue(slider.dataset.bezelProp!) === slider.max)

// A closed panel has to keep its box, which is the whole reason for inert over
// hidden, and nothing in the script may put display:none back on it.
check('no panel is ever hidden outright', panels0.every((p) => !p.hasAttribute('hidden')),
  'a hidden attribute collapses the box and the page jumps on every switch')

const panelClasses = panelsBefore.map((p) => p.className)

console.log('\ntabs')
const tabs = [...tabList.querySelectorAll<HTMLElement>('[role="tab"]')]
const panels = tabs.map((tab) => doc.getElementById(tab.getAttribute('aria-controls')!)!)
check('tab list is revealed', !tabList.hasAttribute('hidden'))
check('root is flagged ready for its own CSS', tabRoot.hasAttribute('data-tabs-ready'))
check('three tabs found', tabs.length === 3, `got ${tabs.length}`)
check('every tab resolves to a panel', panels.every(Boolean))
check('the script gives each panel its role', panels.every((p) => p.getAttribute('role') === 'tabpanel'))
check('each panel is labelled by its own tab',
  panels.every((p, i) => p.getAttribute('aria-labelledby') === tabs[i].id && tabs[i].id))
check('each panel becomes focusable', panels.every((p) => p.getAttribute('tabindex') === '0'))
check('first tab selected', tabs[0].getAttribute('aria-selected') === 'true')
check('other tabs leave the tab order', tabs.slice(1).every((tab) => tab.tabIndex === -1))
check('only the first panel is open', panels.slice(1).every((p) => p.hasAttribute('inert')) && !panels[0].hasAttribute('inert'))

tabs[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
check('arrow down moves selection', tabs[1].getAttribute('aria-selected') === 'true')
check('and swaps the panel', !panels[1].hasAttribute('inert') && panels[0].hasAttribute('inert'))

tabs[1].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
check('arrow up moves back', tabs[0].getAttribute('aria-selected') === 'true')

tabs[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
check('arrow up wraps to the last', tabs.at(-1)!.getAttribute('aria-selected') === 'true')

tabs.at(-1)!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
check('home jumps to the first', tabs[0].getAttribute('aria-selected') === 'true')

tabs[2].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
check('click selects', tabs[2].getAttribute('aria-selected') === 'true')
check('exactly one panel is ever open', panels.filter((p) => !p.hasAttribute('inert')).length === 1)
// A closed panel is marked inert and the section hides it, so the script must not
// hide it as well: an inline style or a class here would take the choice away and,
// with visibility, would break the transition the section fades it out with.
check('panels are closed by attribute, never by inline style',
  panels.every((p) => !p.style.display),
  panels.map((p) => p.style.display).join(','))
check('and never by a class',
  panels.every((p, i) => p.className === panelClasses[i]),
  panels.map((p, i) => `${p.className} was ${panelClasses[i]}`).join(' | '))

console.log('\nnav menu')
const toggle = doc.getElementById('nav-toggle')!
const menu = doc.getElementById('nav-menu')!
check('menu starts closed', menu.hasAttribute('hidden'))
toggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
check('click opens it', !menu.hasAttribute('hidden'))
check('aria-expanded tracks it', toggle.getAttribute('aria-expanded') === 'true')
check('glyphs swap',
  doc.querySelector('[data-nav-icon="open"]')!.hasAttribute('hidden') &&
    !doc.querySelector('[data-nav-icon="close"]')!.hasAttribute('hidden'))
menu.querySelector('a')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
check('following a link closes it', menu.hasAttribute('hidden'))
toggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
check('escape closes it', menu.hasAttribute('hidden'))
check('and restores the glyphs',
  !doc.querySelector('[data-nav-icon="open"]')!.hasAttribute('hidden') &&
    doc.querySelector('[data-nav-icon="close"]')!.hasAttribute('hidden'))

console.log('\nthe nav lists destinations')
// Section anchors here would make every link on a text page a trip home.
const DESTINATIONS = ['Features', 'Help', 'Guides', 'About']
const navLabels = [...doc.querySelectorAll('#nav-links a')].map((a) => a.textContent!.trim())
check('the four destinations are there, in order', navLabels.join(' ') === DESTINATIONS.join(' '), navLabels.join(' '))

const mobileLabels = [...doc.querySelectorAll('#nav-menu a')]
  .map((a) => a.textContent!.trim())
  .filter((label) => DESTINATIONS.includes(label))
check('the mobile panel carries the same four', mobileLabels.join(' ') === DESTINATIONS.join(' '), mobileLabels.join(' '))

const homeMarked = [...doc.querySelectorAll('#site-nav [aria-current]')].map((a) => a.textContent!.trim())
check('the homepage marks Features and nothing else',
  homeMarked.length > 0 && homeMarked.every((label) => label === 'Features'),
  homeMarked.join(' + ') || 'nothing')
check('the wordmark is never marked', !doc.querySelector('#site-nav a[href="#main"][aria-current]'))

console.log('\nthe nav away from the homepage')
// The product sections exist on the homepage and nowhere else, so a bare
// fragment on a text page scrolls nowhere.
const helpDoc = new JSDOM(readFileSync(join(site, 'help', 'index.html'), 'utf8')).window.document
const helpFragments = [...helpDoc.querySelectorAll('#nav-links a, #nav-menu a')]
  .map((link) => link.getAttribute('href')!)
  .filter((href) => href.includes('#'))
check('every in-page target goes home first', helpFragments.length > 0 && helpFragments.every((href) => href.startsWith('/#')),
  helpFragments.join(', ') || 'no fragments found')
check('the wordmark goes home rather than to the top of this page',
  helpDoc.querySelector('#site-nav a')?.getAttribute('href') === '/',
  `got "${helpDoc.querySelector('#site-nav a')?.getAttribute('href')}"`)

const helpMarked = [...helpDoc.querySelectorAll('#site-nav [aria-current]')].map((a) => a.textContent!.trim())
check('the help page marks Help and nothing else',
  helpMarked.length > 0 && helpMarked.every((label) => label === 'Help'),
  helpMarked.join(' + ') || 'nothing')

// A guide sits under /guides/, so a prefix match is what keeps Guides marked there.
const guideFile = readdirSync(join(site, 'guides'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(site, 'guides', entry.name, 'index.html'))
  .find((file) => existsSync(file))
check('a guide was built to check', Boolean(guideFile), join(site, 'guides'))
if (guideFile) {
  const guideDoc = new JSDOM(readFileSync(guideFile, 'utf8')).window.document
  const guideMarked = [...guideDoc.querySelectorAll('#site-nav [aria-current]')].map((a) => a.textContent!.trim())
  check('a page nested under /guides still marks Guides',
    guideMarked.length > 0 && guideMarked.every((label) => label === 'Guides'),
    guideMarked.join(' + ') || 'nothing')
}

console.log('\ncopy button')
// It lives in CopyButton.astro with its own script, which Astro emits as a
// second inline module, so run every module the page carries rather than the
// one belonging to main.ts.
const helpHtml = readFileSync(join(site, 'help', 'index.html'), 'utf8')
const helpModules = [...helpHtml.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1])
check('the help page carries its scripts inline', helpModules.length >= 1, `${helpModules.length} modules`)

const COMMAND = 'xattr -dr com.apple.quarantine /Applications/SpreadPaper.app'

/** A fresh DOM of the help page, optionally with a clipboard, scripts run. */
const runHelp = (clipboard?: { writeText: (t: string) => Promise<void> }) => {
  const dom = new JSDOM(helpHtml, { pretendToBeVisual: true, runScripts: 'outside-only' })
  if (clipboard) Object.defineProperty(dom.window.navigator, 'clipboard', { value: clipboard })
  dom.window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
  dom.window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof window.IntersectionObserver
  helpModules.forEach((module) => dom.window.eval(module))
  return dom
}

// Without a clipboard the button is a lie, so it must stay hidden.
const dry = runHelp()
const dryButton = dry.window.document.querySelector('.copy')!
check('the copy button ships hidden', dryButton.hasAttribute('hidden'))
check('and stays hidden where there is no clipboard',
  dry.window.navigator.clipboard ? !dryButton.hasAttribute('hidden') : dryButton.hasAttribute('hidden'))
check('the command is readable without it',
  dry.window.document.querySelector('.cd-code')!.textContent!.includes('xattr'))
check('the button carries the exact string it will write',
  dryButton.getAttribute('data-copy') === COMMAND, `carries "${dryButton.getAttribute('data-copy')}"`)

// jsdom ships no clipboard, so stub one: the refusal path above is otherwise
// the only thing ever exercised, and the affordance itself never runs.
let written = ''
const wet = runHelp({ writeText: async (text: string) => { written = text } })
const button = wet.window.document.querySelector<HTMLElement>('.copy')!
check('it appears once it can do something', !button.hasAttribute('hidden'))

const faces = [...button.querySelectorAll('[data-face]')]
check('both faces are in the markup, so the swap can be a cross fade', faces.length === 2)
check('only the idle face is announced at rest',
  button.querySelectorAll('[data-face][aria-hidden="true"]').length === 1 &&
    button.querySelector('[data-face="done"]')!.hasAttribute('aria-hidden'))

button.dispatchEvent(new wet.window.MouseEvent('click', { bubbles: true }))
await new Promise((resolve) => setTimeout(resolve, 0))
check('clicking writes the command verbatim', written === COMMAND, `wrote "${written}"`)
check('and the copied state is set, which is what the CSS animates',
  button.hasAttribute('data-copied'))
check('and the announcement follows the face that is showing',
  button.querySelector('[data-face="idle"]')!.hasAttribute('aria-hidden') &&
    !button.querySelector('[data-face="done"]')!.hasAttribute('aria-hidden'))

console.log('\nclock phase')
const clock = doc.querySelector<HTMLElement>('[data-clock-stops]')!
check('a section carries the clock contract', Boolean(clock))
// Read off the markup rather than restated here, so changing the stops cannot
// leave this asserting a schedule the page no longer runs.
const stops = clock.dataset.clockStops!.split(',').map((stop) => Number(stop.trim()))
const hour = new Date().getHours()
// Re-derived rather than hardcoded, so the check means something at any hour.
const found = stops.findLastIndex((stop) => stop <= hour)
const expected = String((found < 0 ? stops.length - 1 : found) / stops.length)
check(`phase matches the wall clock at ${hour}:00`,
  clock.style.getPropertyValue('--clock-phase') === expected,
  `got "${clock.style.getPropertyValue('--clock-phase')}" want "${expected}"`)
check('the phase is a bare fraction, so the section owns the duration',
  /^0(\.\d+)?$/.test(clock.style.getPropertyValue('--clock-phase')))

console.log('\nicons')
const glyphs = [...doc.querySelectorAll('svg')].filter((s) => s.getAttribute('viewBox') === '0 0 256 256')
check('every Phosphor glyph is hidden from assistive tech',
  glyphs.length > 0 && glyphs.every((g) => g.getAttribute('aria-hidden') === 'true'), `${glyphs.length} glyphs`)
check('no icon token survived unexpanded', !html.includes('@icon'))

console.log('\ninline elements keep their spaces')
// Astro strips the newline between a word and a following tag, so prose written
// as "Ask at\n<a ...>" ships as "Ask athello@spreadpaper.app". This reached
// production once before anyone noticed, because it is invisible in the source
// and only shows in the rendered line. Read every built page, not just the one.
const builtPages = readdirSync(site, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== '_astro')
  .map((entry) => join(site, entry.name, 'index.html'))
  .filter((file) => existsSync(file))
  .concat(join(site, 'index.html'))
const glued: string[] = []
for (const file of builtPages) {
  const page = readFileSync(file, 'utf8')
  // A word character hard against an opening tag, or a closing tag hard against one.
  for (const m of page.matchAll(/[a-z,;:.]<(?:a|code|strong|em)[\s>]|<\/(?:a|code|strong|em)>[a-zA-Z]/g)) {
    glued.push(`${file.replace(site, '')}: ${page.slice(Math.max(0, m.index! - 30), m.index! + 30)}`)
  }
}
check('no word is glued to an inline tag', glued.length === 0, glued.slice(0, 3).join(' | '))

console.log('\nthe layout rules survive compilation')
// A stray comment fragment in style.css once ate the whole .cd-textpage rule.
// The build stayed green, astro check passed, and every page still returned 200,
// because a dropped CSS rule is not an error anywhere. The only place it shows
// is the compiled stylesheet, so read that rather than the source.
// Astro splits these across several files, one per component that owns global
// styles, so read all of them rather than whichever comes first alphabetically.
const cssFiles = readdirSync(join(site, '_astro')).filter((f) => f.endsWith('.css'))
check('stylesheets were emitted', cssFiles.length > 0, `${cssFiles.length} files`)
if (cssFiles.length) {
  const css = cssFiles.map((f) => readFileSync(join(site, '_astro', f), 'utf8')).join('\n')
  // Selectors the text pages cannot lay out without. Each is load bearing:
  // lose one and the page still builds, still passes, and looks broken.
  for (const selector of ['.cd-textpage', '.cd-shell', '.prose-cd', '--textpage-measure', '--textpage-band']) {
    check(`${selector} reached the compiled CSS`, css.includes(selector))
  }
}

console.log('\nthe photograph credits')
// Two grids off one array: order is the only thing keeping a photographer
// under their own photograph, and a swap still builds and still looks right.
const bands = [...doc.querySelectorAll('#site-footer .mos-seg')]
const credits = [...doc.querySelectorAll('#site-footer .mos-name')]
check('six bands are in the strip', bands.length === 6, `${bands.length} bands`)
check('and six names under it', credits.length === 6, `${credits.length} names`)

if (bands.length === credits.length) {
  bands.forEach((band, i) => {
    const photographer = credits[i].querySelector('b')!.textContent!.trim()
    const label = band.getAttribute('aria-label') ?? ''
    check(`band ${i + 1} is credited to the name under it`, label.includes(photographer),
      `"${label}" does not name ${photographer}`)
  })
}

const files = bands.map((band) => band.querySelector('img')!.getAttribute('src')!)
check('every band is a different photograph', new Set(files).size === files.length, files.join(', '))
for (const file of files) {
  check(`${file} was published`, existsSync(join(site, file.replace(/^\//, ''))))
}

const profiles = credits.map((a) => a.getAttribute('href')!)
check('every name links to a photographer rather than a photo',
  profiles.length === 6 && profiles.every((href) => href.startsWith('https://unsplash.com/@')),
  profiles.join(', '))
check('and the licence is linked once',
  doc.querySelectorAll('#site-footer a[href="https://unsplash.com/license"]').length === 1)

console.log('\nthe footer columns')
// Once the top nav has taken its four, these pages are reachable from nowhere
// else, so a column that drifts back to all GitHub orphans them.
const footerHrefs = [...doc.querySelectorAll('#site-footer a')].map((a) => a.getAttribute('href')!)
for (const href of ['/help', '/guides', '/about', '/alternatives', '/privacy', '/terms']) {
  const hits = footerHrefs.filter((candidate) => candidate === href).length
  check(`${href} is linked from the footer exactly once`, hits === 1, `${hits} links`)
}

const headings = [...doc.querySelectorAll('#site-footer nav[aria-labelledby] h2')].map((h) => h.textContent!.trim())
check('three named columns', headings.length === 3, headings.join(' / '))
check('every column heading has the id its nav points at',
  [...doc.querySelectorAll('#site-footer nav[aria-labelledby]')].every((nav) =>
    nav.querySelector(`#${nav.getAttribute('aria-labelledby')}`) !== null))

// The site's own pages come first, because a reader at the bottom of a page is
// on this site rather than on GitHub.
const firstColumn = [...doc.querySelectorAll('#site-footer nav[aria-labelledby] a')]
  .slice(0, 6)
  .map((a) => a.getAttribute('href')!)
check('the first column is this site, not the repository',
  firstColumn.every((href) => href.startsWith('/')), firstColumn.join(', '))

console.log('\nthe last line of the footer')
const lastRow = [...doc.querySelectorAll('#site-footer .base-line')].map((p) => p.textContent!.trim())
check('it is the copyright and the address, nothing else', lastRow.length === 2, lastRow.join(' | '))
check('the copyright line carries a four digit year', /Copyright \d{4} /.test(lastRow[0] ?? ''), lastRow[0])
const copyrightLinks = [...doc.querySelectorAll('#site-footer .base-line a')].map((a) => a.getAttribute('href')!)
check('the name links to its author', copyrightLinks.includes('https://robinvanbaalen.nl'), copyrightLinks.join(', '))
check('and the licence is linked', copyrightLinks.some((href) => href.endsWith('/LICENSE')), copyrightLinks.join(', '))
check('the address is still reachable',
  footerHrefs.includes('mailto:hello@spreadpaper.app'))

console.log('\nthe hero switch')
// A reader with no JavaScript needs the spanned desk and no dead control.
const heroStage = doc.getElementById('hero-stage')!
const heroToggle = doc.getElementById('hero-toggle')!
const heroState = doc.getElementById('hero-state')!
check('the stage ships on, so the spanned desk is what a still page shows', heroStage.hasAttribute('data-on'))
check('the switch says so too', heroToggle.getAttribute('aria-checked') === 'true')
check('the switch was revealed by the script', !doc.getElementById('hero-switch')!.hasAttribute('hidden'))
check('and the stage is flagged ready, which is what arms the wipe', heroStage.hasAttribute('data-ready'))

const spokenBefore = heroState.textContent!.trim()
heroToggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
check('clicking turns it off', heroToggle.getAttribute('aria-checked') === 'false' && !heroStage.hasAttribute('data-on'))
check('and the sentence follows the switch', heroState.textContent!.trim() !== spokenBefore)
heroToggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
check('clicking again turns it back on', heroToggle.getAttribute('aria-checked') === 'true' && heroStage.hasAttribute('data-on'))
check('and the sentence comes back', heroState.textContent!.trim() === spokenBefore)

// Lose a layer and the wipe reveals nothing.
const heroRigs = [...heroStage.querySelectorAll('svg.rig')]
check('four rigs: a pair for each breakpoint', heroRigs.length === 4, `${heroRigs.length} rigs`)
check('half of them are the upper layer', heroRigs.filter((r) => r.classList.contains('rig-layer')).length === 2)

// display:none does not stop a fetch, and the preload matches one URL.
const heroPhotos = new Set([...heroStage.querySelectorAll('image')].map((i) => i.getAttribute('href')!))
check('every rig points at the one preloaded photograph', heroPhotos.size === 1, [...heroPhotos].join(', '))

console.log('\nthe download card')
const cardFacts = [...doc.querySelectorAll('#hero .hero-fact')].map((row) => [
  row.querySelector('dt')!.textContent!.trim(),
  row.querySelector('dd')!.textContent!.trim(),
])
check('it answers four things', cardFacts.length === 4, JSON.stringify(cardFacts))
const fact = (term: string) => cardFacts.find((row) => row[0] === term)?.[1] ?? ''
check('the version is a version, read from the release at build time', /^\d+\.\d+\.\d+$/.test(fact('Version')), fact('Version'))
check('the size is megabytes, not bytes', /^\d+ MB$/.test(fact('Download')), fact('Download'))
check('it names the macOS it needs', fact('Requires').includes('macOS'), fact('Requires'))
check('and the licence', fact('Licence') === 'MIT', fact('Licence'))

console.log('\nthe editor bench')
const benchCanvas = doc.querySelector('[data-canvas]')!
const benchRows = () => [...doc.querySelectorAll('[data-list] [data-row]')]
const benchSay = () => doc.querySelector('[data-readout-text]')!.textContent!.trim()
const benchWide = () => Number(benchCanvas?.getAttribute('viewBox')?.split(' ')[2])
const act = (name: string) => doc.querySelector<HTMLButtonElement>(`[data-act="${name}"]`)!

check('the script writes it in', !benchMount.hasAttribute('hidden') && !!doc.querySelector('[data-bench]'))
check('and takes the still canvas down, so only one of the two shows', benchStill.hasAttribute('hidden'))
// The svg ships empty; a viewBox means the desk was drawn from state.
check('the canvas is drawn', /^-?\d/.test(benchCanvas?.getAttribute('viewBox') ?? ''), benchCanvas?.getAttribute('viewBox') ?? 'none')
check('it opens on two displays', benchRows().length === 2, `${benchRows().length} rows`)
// The first build marks no row, which is not asserted: the marker clears on
// the next animation frame, so such a check cannot fail.

const benchStart = benchWide()
doc.querySelector<HTMLButtonElement>('[data-addbutton]')!.click()
check('the add menu opens', !doc.querySelector('[data-menu]')!.hasAttribute('hidden'))
check('and offers the shared panel catalogue', doc.querySelectorAll('[data-add]').length === 6,
  `${doc.querySelectorAll('[data-add]').length} panels`)
doc.querySelector<HTMLButtonElement>('[data-add="ultrawide34"]')!.click()
check('a third display is listed', benchRows().length === 3, `${benchRows().length} rows`)
// The rebuild recreates all three, so marking the wrong ones animates the lot.
const entering = benchRows().filter((row) => row.hasAttribute('data-entering'))
check('only the display just added is marked as arriving', entering.length === 1,
  `${entering.length} of ${benchRows().length} rows marked`)
check('and it is the new one', entering[0] === benchRows()[2])
check('the canvas widens to hold it', benchWide() > benchStart, `${benchWide()} vs ${benchStart}`)
check('and the new one is selected', benchRows()[2].getAttribute('aria-current') === 'true')

doc.querySelectorAll<HTMLButtonElement>('[data-remove]')[2].click()
check('removing it takes it off the list', benchRows().length === 2, `${benchRows().length} rows`)
check('and the selection lands on one that still exists',
  benchRows().some((row) => row.getAttribute('aria-current') === 'true'))
// A copy is left behind to animate out, so the desk loses the display at once
// while the row still closes its own gap. It must not be a row any more.
const ghost = doc.querySelector('[data-list] .bn-row:not([data-row])')
check('a copy of the removed row is left to animate out', Boolean(ghost))
check('and it is out of reach while it goes',
  ghost?.getAttribute('aria-hidden') === 'true' &&
    [...(ghost?.querySelectorAll('button') ?? [])].every((b) => b.getAttribute('tabindex') === '-1'))
check('it carries a height to collapse from', /^\d/.test((ghost as HTMLElement)?.style.height ?? ''))

// A desk with no displays has nothing to draw, so the last one stays.
doc.querySelectorAll<HTMLButtonElement>('[data-remove]')[1].click()
check('the last display keeps a disabled remove', benchRows()[0].querySelector<HTMLButtonElement>('[data-remove]')!.disabled)
doc.querySelectorAll<HTMLButtonElement>('[data-remove]')[0].click()
check('clicking it anyway leaves the display alone', benchRows().length === 1, `${benchRows().length} rows`)
doc.querySelector<HTMLButtonElement>('[data-reset]')!.click()
check('start again restores the opening desk', benchRows().length === 2, `${benchRows().length} rows`)

check('zoom opens at 100%', benchSay().startsWith('Zoom 100%'), benchSay())
check('and cannot go below it, since a smaller picture uncovers a screen', act('out').disabled)
act('in').click()
check('zooming in steps to 125%', benchSay().startsWith('Zoom 125%'), benchSay())
check('which frees zooming out', !act('out').disabled)
for (let i = 0; i < 20; i++) act('in').click()
check('zoom stops at 400%', benchSay().startsWith('Zoom 400%'), benchSay())
check('and the button says so', act('in').disabled)

act('flip').click()
check('flip reports itself pressed', act('flip').getAttribute('aria-pressed') === 'true')
check('and the drawing is actually mirrored', benchCanvas.innerHTML.includes('scaleX(-1)'))
act('fit').click()
check('fit returns to 100% and the middle', benchSay().startsWith('Zoom 100%') && benchSay().includes('Centred'), benchSay())

// Dragging means two things, so only one set of handles may be live at a time.
doc.querySelector<HTMLButtonElement>('[data-mode-set="place"]')!.click()
check('placing the picture takes the display handles off the canvas', !benchCanvas.innerHTML.includes('data-display'))
check('and the hint follows the mode', doc.querySelector('[data-hint]')!.textContent!.includes('Drag the wallpaper'))
doc.querySelector<HTMLButtonElement>('[data-mode-set="arrange"]')!.click()
check('arranging brings them back', benchCanvas.innerHTML.includes('data-display'))

// One of two rather than two switches, which is a radiogroup: one tab stop,
// arrows inside it, and the selection carrying focus with it.
const seg = doc.querySelector('[data-seg]')!
const segItems = [...doc.querySelectorAll<HTMLElement>('[data-mode-set]')]
check('the mode control is a radiogroup', seg.getAttribute('role') === 'radiogroup')
check('and its options are radios', segItems.every((b) => b.getAttribute('role') === 'radio'))
check('exactly one is checked', segItems.filter((b) => b.getAttribute('aria-checked') === 'true').length === 1)
check('and only that one is in the tab order',
  segItems.filter((b) => b.tabIndex === 0).length === 1 &&
    segItems.find((b) => b.getAttribute('aria-checked') === 'true')!.tabIndex === 0)

seg.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
check('an arrow key moves the selection', segItems[1].getAttribute('aria-checked') === 'true')
check('and the tab stop moves with it', segItems[1].tabIndex === 0 && segItems[0].tabIndex === -1)
check('and the canvas follows', !benchCanvas.innerHTML.includes('data-display'))
seg.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
check('and the opposite arrow returns it', segItems[0].getAttribute('aria-checked') === 'true' &&
  benchCanvas.innerHTML.includes('data-display'))

// The thumb is positioned from a measurement, so it has to be written at all.
const segThumb = doc.querySelector<HTMLElement>('[data-seg-thumb]')!
check('the selection thumb is placed by the render', /translateX/.test(segThumb.style.transform), segThumb.style.transform || 'unset')

// Arrow keys are the keyboard road to the drag, and they snap like it does.
const benchRow = benchRows()[1]
const frameX = () => benchCanvas.querySelectorAll('rect.rig-frame')[1]?.getAttribute('x')
const nudge = (key: string) => benchRow.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }))
const restX = frameX()
nudge('ArrowRight')
check('an arrow key moves a display', frameX() !== restX, `${restX} to ${frameX()}`)
nudge('ArrowLeft')
check('and it snaps back to its neighbour', frameX() === restX, `${frameX()} want ${restX}`)

// Two displays cannot occupy the same space, so one walked into another has to
// shove it clear rather than sit on top of it. Nothing else catches this: the
// canvas draws a plausible desk either way.
const boxes = () =>
  [...benchCanvas.querySelectorAll('rect.rig-frame')].map((r) => ({
    x: Number(r.getAttribute('x')),
    y: Number(r.getAttribute('y')),
    w: Number(r.getAttribute('width')),
    h: Number(r.getAttribute('height')),
  }))
const overlapping = () => {
  const all = boxes()
  return all.some((a, i) =>
    all.some((b, j) => j > i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h))
}

check('the desk opens with nothing overlapping', !overlapping())
// Far enough to bury it inside its neighbour several times over.
for (let i = 0; i < 40; i++) nudge('ArrowLeft')
check('walking one display into another leaves them clear', !overlapping(),
  boxes().map((b) => `${b.x},${b.y}`).join(' '))
check('and the desk still holds every display it had', boxes().length === benchRows().length,
  `${boxes().length} drawn, ${benchRows().length} listed`)

// A drag is allowed to pass one display through another; it is letting go that
// makes the desk valid. Pushing mid drag moves the target the reader is aiming
// at, so the two halves are asserted separately.
// jsdom has PointerEvent but no pointer capture, and `unitsPerPixel` already
// falls back to 1 on an unlaid-out element, so one client pixel is one unit.
;(benchCanvas as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
const hit = benchCanvas.querySelector('[data-display]')
const pointer = (type: string, x: number, target: Element) =>
  target.dispatchEvent(new window.PointerEvent(type, { pointerId: 1, clientX: x, clientY: 0, bubbles: true }))

check('a display carries a drag handle', Boolean(hit))
if (hit) {
  // Straight onto its neighbour's left edge, which is a snap candidate, so the
  // two land exactly on top of each other rather than near each other.
  const onto = boxes()[1].x - boxes()[0].x
  pointer('pointerdown', 0, hit)
  pointer('pointermove', onto, benchCanvas)
  check('a drag may take one display over another', overlapping(),
    boxes().map((b) => `${b.x},${b.y}`).join(' '))
  pointer('pointerup', onto, benchCanvas)
  check('and letting go pushes them apart', !overlapping(),
    boxes().map((b) => `${b.x},${b.y}`).join(' '))
}

// Two displays cannot show the real problem: a shove only lands on a third when
// there is a third to land on. Built from a known desk rather than from
// whatever the checks above left behind, so the chain is certain to happen.
doc.querySelector<HTMLButtonElement>('[data-reset]')!.click()
doc.querySelector<HTMLButtonElement>('[data-mode-set="arrange"]')!.click()
for (let i = 0; i < 2; i++) {
  doc.querySelector<HTMLButtonElement>('[data-addbutton]')!.click()
  doc.querySelector<HTMLButtonElement>('[data-add="monitor27"]')!.click()
}
check('the desk is a row of four', boxes().length === 4, `${boxes().length}`)
check('and the row starts clear', !overlapping())

const row = benchCanvas.querySelector('[data-display]')
if (row) {
  /* A shove travels along whichever axis the overlap is shallower on, and two
     displays side by side always overlap fully in the vertical. So the bite has
     to be shallower across than down, or the neighbour goes under the row
     instead of along it and nothing chains. */
  const bite = Math.round(boxes()[0].h / 2)
  const onto2 = boxes()[1].x - (boxes()[0].w + 6) + bite - boxes()[0].x
  pointer('pointerdown', 0, row)
  pointer('pointermove', onto2, benchCanvas)
  pointer('pointerup', onto2, benchCanvas)
  check('a shove passed down the row leaves every display clear', !overlapping(),
    boxes().map((b) => `${b.x},${b.y}`).join(' '))
  check('and none of them is lost doing it', boxes().length === 4, `${boxes().length}`)
}

console.log('\nthe drag and the scale under it')
/* The canvas is a fixed box holding a viewBox that grows with the desk, so the
   scale moves while a drag is in flight. On a page of its own, because every
   check above wants an unlaid-out canvas answering one unit per pixel. */
const STEP = -60

/**
 * Walks one display left and reports where it lands, in drawing units.
 *
 * @param runs - How many pointer moves of the same size to make.
 * @param inOneGo - Whether they belong to a single drag or to a drag each.
 */
const walkedLeft = (runs: number, inOneGo: boolean): number => {
  const w = new JSDOM(html, { pretendToBeVisual: true, runScripts: 'outside-only' }).window
  w.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof w.matchMedia
  w.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof w.IntersectionObserver
  bundles.forEach((source) => w.eval(`(function () {\n${source}\n})()`))

  const canvas = w.document.querySelector('[data-canvas]')!
  ;(canvas as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
  canvas.getBoundingClientRect = (() =>
    ({ x: 0, y: 0, left: 0, top: 0, width: 800, height: 450, right: 800, bottom: 450, toJSON: () => ({}) })) as Element['getBoundingClientRect']

  const at = (type: string, x: number) =>
    (type === 'pointerdown' ? canvas.querySelector('[data-display]')! : canvas).dispatchEvent(
      new w.PointerEvent(type, { pointerId: 1, clientX: x, clientY: 0, bubbles: true })
    )

  if (inOneGo) {
    at('pointerdown', 0)
    for (let i = 1; i <= runs; i++) at('pointermove', i * STEP)
    at('pointerup', runs * STEP)
  } else {
    for (let i = 0; i < runs; i++) {
      at('pointerdown', 0)
      at('pointermove', STEP)
      at('pointerup', STEP)
    }
  }
  return Number(canvas.querySelector('rect.rig-frame')!.getAttribute('x'))
}

/* A drag each is the reference: the scale is read when each one starts, so it
   is right for the desk it acts on however the desk has grown. One long drag
   has to arrive at the same place, which it only does if it reads the scale as
   it goes rather than keeping the one it opened with. */
const RUNS = 10
const apart = walkedLeft(RUNS, false)
const together = walkedLeft(RUNS, true)
check('one long drag lands where the same walk in short drags lands',
  Math.abs(together - apart) < 10, `${together} against ${apart}`)
check('and the walk went somewhere', apart < -100, String(apart))

console.log('\nthe bench answers a press')
// Read off the compiled sheet, not the source: scoped CSS never reaches markup
// a script builds. See DESIGN.md, Overriding the primitives.

for (const selector of [
  '.bn-thumb:active',
  '.bn-menu-item:active',
  '.bn-seg-item:active',
  '.bn-tool:not(:disabled):active',
  '.bn-remove:not(:disabled):active',
]) {
  check(`${selector} reached the compiled CSS`, styles.includes(selector))
}

console.log('\nthe bench motion survives compilation')
// A registered property is the only reason zoom can ease: draw() rebuilds the
// group that reads it, so the transition has to live on the canvas above it.
// Matched to the brace rather than by substring: `@property --bn-zoom-X` would
// satisfy an includes() check while registering a property nothing reads.
check('--bn-zoom is registered, so it interpolates as a number',
  /@property\s+--bn-zoom\s*\{[^}]*syntax:\s*"?'?<number>/.test(styles))
check('and the canvas is what transitions it', /\.bn-canvas\{[^}]*--bn-zoom/.test(styles.replace(/\s+/g, '')),
  'the transition has to sit on the element that outlives the rebuild')
check('a drag drops the easing', styles.includes('.bn-canvas[data-dragging]'))
check('the menu has an open state to animate to', styles.includes('.bn-menu[data-open]'))
check('a new row has an entering state', styles.includes('.bn-row[data-entering]'))
check('and a removed one has a leaving state', styles.includes('.bn-row[data-leaving]'))
check('the leaving row collapses, or the rows under it jump',
  /\.bn-row\[data-leaving\]\{[^}]*height:0/.test(styles.replace(/\s+/g, '')))

// The script and the stylesheet have to agree on the property name, and nothing
// else would catch a rename: the transform silently resolves to nothing.
check('the drawn transform reads the same property the CSS declares',
  bundles.join("\n").includes('scale(var(--bn-zoom))') && bundles.join("\n").includes('--bn-zoom'))

// The panel stays mounted while it animates out, so aria-expanded rather than
// `hidden` is what the script reads.
const addButton = doc.querySelector('[data-addbutton]')
check('the add button carries the state the script reads',
  addButton?.hasAttribute('aria-expanded') === true)

console.log('\nthe bench control strip')
// Everything used while working shares one track; the reset is not one of those.
const track = doc.querySelector('.bn-track')!
check('there is one track', doc.querySelectorAll('.bn-track').length === 1)
check('the mode group is inside it', Boolean(doc.querySelector('[data-seg]')?.closest('.bn-track')))
check('and so are the tools', Boolean(doc.querySelector('[data-act]')?.closest('.bn-track')))
check('the tools are a bare run, not a track of their own',
  doc.querySelectorAll('.bn-tools').length === 1 && !doc.querySelector('.bn-tools')!.matches('.bn-track'))

const reset = doc.querySelector('[data-reset]')!
check('the reset sits outside the track', !reset.closest('.bn-track'))
const strip = doc.querySelector('.bn-bar')!
check('and last in the strip', strip.lastElementChild === reset, strip.lastElementChild?.className ?? 'nothing')

// The status reports on the canvas, so it lives there. In the strip it wore the
// same border and fill as the button beside it.
const status = doc.querySelector('[data-readout]')!
check('the status sits on the canvas', Boolean(status.closest('[data-box]')))
check('and not in the strip', !status.closest('.bn-bar'))
check('it announces itself when it changes', status.getAttribute('aria-live') === 'polite')
check('and it survives a redraw of the canvas', Boolean(doc.querySelector('[data-readout-text]')))

// Measured in the render, and armed a frame late so it does not grow out of
// nothing on load. Neither shows up anywhere but the eye.
const thumb = doc.querySelector<HTMLElement>('[data-seg-thumb]')!
check('the thumb is placed by the render', /translateX/.test(thumb.style.transform), thumb.style.transform || 'unset')
check('and its width is measured, not assumed', /^\d/.test(thumb.style.width), thumb.style.width || 'unset')
// The bench is shown before it is built, since a hidden box measures zero and
// the thumb would then ship with no width until the reader touched something.
check('and measured on load, not left at zero until the first interaction',
  thumbOnLoad === `${LAID_OUT}px`, thumbOnLoad || 'unset')
// The attribute itself is set on the next animation frame, which a synchronous
// read can never see, so the guarantee is checked where it lives: every
// compiled rule that slides the thumb, and whether the flag is in its selector.
// Whitespace stays, because stripping it welds a descendant combinator shut and
// the pattern then matches nothing at all.
const thumbRules = [...styles.matchAll(/([^{}]*\.bn-seg-thumb[^{}]*)\{([^}]*)\}/g)].map((rule) => ({
  parts: rule[1].split(',').filter((part) => part.includes('.bn-seg-thumb')),
  slides: /(^|;)\s*transition(-duration)?\s*:/.test(rule[2]),
}))
const armed = thumbRules.filter((rule) => rule.slides)
check('the thumb is styled by the compiled sheet at all', thumbRules.length > 0)
check('the slide only exists behind the ready flag',
  armed.length > 0 && armed.every((rule) => rule.parts.every((part) => part.includes('[data-ready]'))),
  armed.map((rule) => rule.parts.join(',')).join(' | ') || 'nothing transitions the thumb')

console.log('\nthe bench drawing')
const drawnMarkup = benchCanvas.innerHTML
// A presentation attribute cannot resolve a custom property, and an SVG rect
// with an invalid fill paints black. `style` is the one place a variable works.
const leaning = [...drawnMarkup.matchAll(/\s([a-zA-Z-]+)="[^"]*var\(/g)].filter((m) => m[1] !== 'style')
check('no drawn presentation attribute leans on a CSS variable', leaning.length === 0,
  leaning.map((m) => m[1]).join(', '))

// The rule scripts/rigs.ts holds every static rig to, applied to the one rig
// the generator cannot draw.
const boxOf = (r: Element) => ['x', 'y', 'width', 'height'].map((k) => r.getAttribute(k)).join(',')
const clipRects = [...benchCanvas.querySelectorAll('clipPath rect')].map(boxOf)
const frameRects = [...benchCanvas.querySelectorAll('rect.rig-frame')].map(boxOf)
check('every clip rect is traced by a frame of the same geometry',
  clipRects.length > 0 && clipRects.join(' | ') === frameRects.join(' | '),
  `${clipRects.join(' | ')} against ${frameRects.join(' | ')}`)

// Two glyphs are optically larger than their neighbours at the same nominal
// size. Matched with its selector: a bare scale() search would pass on any
// unrelated rule that happened to use the same number.
check('the zoom glyphs keep their optical correction',
  /\.bn-tool\[data-act=["']?in["']?\]svg[^{]*\{[^}]*scale\(\.?0?\.?92\)/.test(styles.replace(/\s+/g, '')),
  'plus and minus fill more of the box than the arrows do')

/**
 * Every stylesheet a page actually uses. Astro emits a file or inlines the
 * block once it is small enough, and the about page is inlined, so a search of
 * `_astro` alone passes by finding nothing.
 */
const stylesOf = (pageHtml: string) =>
  [styles, ...[...pageHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1])].join('\n')

console.log('\nthe count in the copy')
// The about page spells a number the build reads from GitHub, so the sentence
// has to hold at every count the API can answer with, one included.
check('a lone contributor is a person, not a people', people(1) === 'one person', people(1))
check('two or more are people', people(2) === 'two people', people(2))
check('a count past the words stays in digits', people(13) === '13 people', people(13))

console.log('\nthe about page')
const aboutHtml = readFileSync(join(site, 'about', 'index.html'), 'utf8')
const aboutDoc = new JSDOM(aboutHtml).window.document

check('/project is gone rather than redirected', !existsSync(join(site, 'project', 'index.html')))

// The list is read from GitHub at build time, so nothing on the page may state
// a count the data can outgrow.
const contributors = [...aboutDoc.querySelectorAll('.person')].map((a) => a.getAttribute('href')!)
check('every contributor links to a GitHub profile',
  contributors.length > 1 && contributors.every((href) => /^https:\/\/github\.com\/[^/]+$/.test(href)),
  contributors.join(', '))

const aboutHeading = aboutDoc.querySelector('h1')!.textContent!.trim()
check('the headline counts the people it lists',
  aboutHeading.includes(`built by ${people(contributors.length)}`), aboutHeading)

const aboutSub = aboutDoc.querySelector('.sec-sub')!.textContent!.trim()
check('the contributions line counts one fewer',
  aboutSub.includes(`${people(contributors.length - 1)} besides me`), aboutSub)
// Whatever the API answers with, the noun agrees with the number in front of
// it. Read a sentence at a time, since the text of the page as a whole welds
// the end of one into the start of the next and the boundary is lost.
const aboutSentences = [
  ...[...aboutDoc.querySelectorAll('h1, h2, p')].map((el) => el.textContent!.replace(/\s+/g, ' ').trim()),
  aboutDoc.querySelector('meta[property="og:description"]')!.getAttribute('content')!,
]
const miscounted = aboutSentences.filter(
  (line) =>
    /\bone people\b/.test(line) ||
    /\b(no|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+) person\b/.test(line)
)
check('no sentence on the page miscounts its noun', miscounted.length === 0, miscounted.join(' | '))
// A spelled number is lower case, so it cannot be the first word of a sentence.
check('and does not open a sentence in lower case', /^[A-Z]/.test(aboutSub), aboutSub)

const factKeys = [...aboutDoc.querySelectorAll('.fk')].map((el) => el.textContent!.trim())
check('six facts sit beside the note', factKeys.length === 6, factKeys.join(', '))
check('the star figure is a number, not a word',
  /\d/.test(aboutDoc.querySelector('.hv-facts')!.textContent!))
check('the signature links to the author site',
  aboutDoc.querySelector('.sign a[href="https://robinvanbaalen.nl"]') !== null)

// An auto-fill grid left holes on the second row, so a tile has to grow. The
// minifier rewrites `flex: 1 1 11rem` to the equivalent `flex: 11rem`, so this
// reads the value rather than matching how it happens to be spelled.
const personRule = stylesOf(aboutHtml).replace(/\s+/g, ' ').match(/\.person[^{]*\{([^}]*)\}/)
const personFlex = personRule?.[1].match(/(?:^|;)\s*flex:\s*([^;]+)/)?.[1].trim()
check('the contributor tiles grow to fill a short row',
  Boolean(personFlex) && !/^(none|0)\b/.test(personFlex!),
  `flex resolved to ${personFlex ?? 'nothing'}`)

console.log('\nthe contributor list')
// Read from GitHub at build time. Half an answer used to ship as though it were
// the whole one, and the page counts what it is handed, so a degraded build
// credited two people and called them seven.

/** The record shape either endpoint answers with, as JSON over the wire. */
const answers = (records: unknown[]) =>
  new Response(JSON.stringify(records), { headers: { 'content-type': 'application/json' } })
const refuses = () => new Response('', { status: 403 })

/**
 * Runs the module against a stub of GitHub and hands back who it credits.
 * A fresh instance per call, since the real one answers once per build.
 *
 * @param reply - What the stub returns for a given request URL.
 * @param tag - Anything unique, which is what makes the import fresh.
 */
const crediting = async (reply: (path: string) => Response, tag: string): Promise<string[]> => {
  const real = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request) => reply(String(url))) as typeof fetch
  try {
    const module = await import(`../src/lib/contributors.ts?${tag}`)
    const list: { user: string }[] = await module.contributors()
    return list.map((person) => person.user)
  } finally {
    globalThis.fetch = real
  }
}

const committer = (login: string) => ({ login, contributions: 3 })
const raiser = (login: string) => ({ user: { login } })

const offline = await crediting(refuses, 'offline')
check('an offline build still credits everyone', offline.length > 2, offline.join(', '))

const halved = await crediting(
  (path) => (path.includes('/issues') ? refuses() : answers([committer('rvanbaalen')])), 'halved')
check('a refused issue tracker falls back rather than crediting the committers alone',
  halved.join(', ') === offline.join(', '), halved.join(', '))

const truncated = await crediting((path) => {
  if (!path.includes('/issues')) return answers([committer('rvanbaalen')])
  return path.endsWith('page=1') ? answers(Array.from({ length: 100 }, () => raiser('someone'))) : refuses()
}, 'truncated')
check('and a walk that stops short is a failure, not a shorter list',
  truncated.join(', ') === offline.join(', '), truncated.join(', '))

const whole = await crediting(
  (path) => answers(path.includes('/issues') ? [raiser('asker')] : [committer('coder')]), 'whole')
check('a whole answer credits the committer and the person who raised it',
  whole.join(', ') === 'coder, asker', whole.join(', '))

console.log('\nthe comparison table')
const altHtml = readFileSync(join(site, 'alternatives', 'index.html'), 'utf8')
const altDoc = new JSDOM(altHtml).window.document

const apps = [...altDoc.querySelectorAll('th[scope="col"]')].map((th) => th.textContent!.trim())
check('six apps are compared', apps.length === 6, apps.join(', '))
const rows = [...altDoc.querySelectorAll('th[scope="row"]')].map((th) => th.textContent!.trim())
check('platform is one of the rows', rows.includes('Platform'), rows.join(' / '))

// Three marks, because a guess about somebody else's software is worse than an
// open cell. Losing the third would quietly turn every unknown into a no.
for (const mark of ['g-yes', 'g-no', 'g-unverified']) {
  check(`${mark} is used at least once`, altDoc.querySelector(`.${mark}`) !== null)
}

const altOutbound = [...altDoc.querySelectorAll('main a[href^="http"]')]
const unmarked = altOutbound.filter((a) => !(a.getAttribute('rel') ?? '').includes('nofollow'))
check('every outbound link in the comparison is nofollow',
  altOutbound.length > 0 && unmarked.length === 0,
  unmarked.map((a) => a.getAttribute('href')).join(', '))

console.log('\nthe guides index')
const guidesHtml = readFileSync(join(site, 'guides', 'index.html'), 'utf8')
const guidesDoc = new JSDOM(guidesHtml).window.document

const questions = [...guidesDoc.querySelectorAll('.qs-item')]
check('six questions', questions.length === 6, String(questions.length))
check('each names the guide it comes from',
  questions.every((item) => (item.querySelector('.qs-src')?.textContent ?? '').trim().length > 0))

// The point of the page: a question lands on the passage that answers it, so a
// renamed heading has to fail here rather than drop the reader at the top.
for (const item of questions) {
  const href = item.getAttribute('href')!
  const [path, fragment] = href.split('#')
  const target = join(site, path.replace(/^\//, '').replace(/\/$/, ''), 'index.html')
  const lands = existsSync(target) && readFileSync(target, 'utf8').includes(`id="${fragment}"`)
  check(`${href} lands on a real section`, Boolean(fragment) && lands)
}

console.log('\nthe 404 finder')
const notFoundHtml = readFileSync(join(site, '404.html'), 'utf8')
const notFoundDoc = new JSDOM(notFoundHtml).window.document

// Rendered at build time for two reasons: Astro's scoped styles never reach
// markup a script builds, and the list has to work with no JavaScript.
const destinations = [...notFoundDoc.querySelectorAll('.nf-row')]
check('every destination ships in the markup', destinations.length === 7, String(destinations.length))
check('each carries the words it is searched by',
  [...notFoundDoc.querySelectorAll('.nf-slot')].every((slot) => (slot.getAttribute('data-hay') ?? '').length > 0))
check('the field waits for the script', notFoundDoc.getElementById('nf-field')!.hasAttribute('hidden'))
check('and so do the key hints', notFoundDoc.getElementById('nf-keys')!.hasAttribute('hidden'))

// Filtering hid rows with `hidden`, which is display: none and cannot
// transition, so nothing moved. The collapse has to stay on the track.
const notFoundStyles = stylesOf(notFoundHtml).replace(/\s+/g, ' ')
check('a filtered row collapses its track rather than switching off',
  /\.nf-slot[^{]*\[data-off\][^{]*\{[^}]*grid-template-rows:\s*0fr/.test(notFoundStyles),
  'expected grid-template-rows: 0fr on [data-off]')
// The collapsing box may carry no padding of its own: a grid item stretched to
// a zero track still renders its padding, which left a band of empty space.
check('and the clipper carries no padding to leave behind',
  /\.nf-clip[^{]*\{(?![^}]*padding)[^}]*\}/.test(notFoundStyles),
  'expected .nf-clip to hold only min-height and overflow')

console.log('\nthe help rail')
const helpPage = readFileSync(join(site, 'help', 'index.html'), 'utf8')
const helpPageDoc = new JSDOM(helpPage).window.document

// The step number is a CSS counter on .step, so renaming the section silently
// prints zero on every chip.
const helpSteps = [...helpPageDoc.querySelectorAll('.step')]
check('three steps, not four', helpSteps.length === 3, String(helpSteps.length))
check('each increments the counter that numbers it',
  helpSteps.every((step) => step.querySelector('.step-kicker') !== null))

const railLinks = [...helpPageDoc.querySelectorAll('.hp-rail-item')]
check('the rail is a working contents list without the script',
  !helpPageDoc.getElementById('hp-rail')!.hasAttribute('hidden') && railLinks.length === helpSteps.length)
check('every rail link points at a step on the page',
  railLinks.every((a) => helpPageDoc.querySelector(a.getAttribute('href')!) !== null),
  railLinks.map((a) => a.getAttribute('href')).join(', '))
check('the marks wait for the script',
  [...helpPageDoc.querySelectorAll('.hp-mark')].every((b) => b.hasAttribute('hidden')))

// Prose caps every direct child at the measure, which crushed the step band
// into 44rem and pushed the rail out of the page.
check('the step band opts out of the prose measure',
  /\.hp-grid[^{]*\{[^}]*max-width:\s*none/.test(stylesOf(helpPage).replace(/\s+/g, ' ')),
  'expected max-width: none on .hp-grid')
check('the quarantine command ships with a copy button',
  helpPage.includes('xattr -dr com.apple.quarantine') &&
    helpPageDoc.querySelector('button.copy[data-copy]') !== null)

// Safari's private window throws on every storage access. The marks were read
// back through storage, so a click there painted nothing and said nothing.
const helpScripts = [
  ...[...helpPage.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)]
    .map((m) => readFileSync(join(site, m[1].replace(/^\//, '')), 'utf8')),
  ...[...helpPage.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]),
]
check('the rail script ships with the page',
  helpScripts.some((source) => source.includes('spreadpaper-help-steps')))

const blocked = new JSDOM(helpPage, { pretendToBeVisual: true, runScripts: 'outside-only' }).window
blocked.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof blocked.matchMedia
blocked.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof blocked.IntersectionObserver
Object.defineProperty(blocked, 'localStorage', {
  get() {
    throw new Error('the user denied storage')
  },
})
helpScripts.forEach((source) => blocked.eval(`(function () {\n${source}\n})()`))

const blockedMark = blocked.document.querySelector<HTMLButtonElement>('[data-mark]')!
const blockedStep = blockedMark.closest('[data-sec]')!
const blockedLabel = blockedStep.querySelector('[data-mark-label]')!
check('the mark is offered even when storage is blocked', !blockedMark.hidden)

blockedMark.dispatchEvent(new blocked.MouseEvent('click', { bubbles: true }))
check('and a click marks the step done', blockedStep.hasAttribute('data-done'))
check('the button says so', blockedMark.getAttribute('aria-pressed') === 'true' && blockedLabel.textContent === 'Done',
  `${blockedMark.getAttribute('aria-pressed')}, "${blockedLabel.textContent}"`)
check('and the rail follows',
  blocked.document.querySelector(`[data-jump="${blockedStep.getAttribute('data-sec')}"]`)!.hasAttribute('data-done'))
check('the reset appears with the first mark', !blocked.document.getElementById('hp-reset')!.hidden)

blockedMark.dispatchEvent(new blocked.MouseEvent('click', { bubbles: true }))
check('a second click clears it again',
  !blockedStep.hasAttribute('data-done') && blockedLabel.textContent === 'Mark as done')

console.log(failures ? `\n${failures} FAILED` : '\nall checks passed')
process.exit(failures ? 1 : 0)
