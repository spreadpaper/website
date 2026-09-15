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
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const site = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const html = readFileSync(join(site, 'index.html'), 'utf8')
// Astro emits the script as a file, or inlines it into the page once it drops
// under 4KB, and it has crossed that line in both directions. Take it from
// wherever this build put it rather than assuming there is a file.
const bundleName = readdirSync(join(site, '_astro')).find((f) => f.endsWith('.js'))
const bundle = bundleName
  ? readFileSync(join(site, '_astro', bundleName), 'utf8')
  : html.match(/<script type="module">([\s\S]*?)<\/script>/)![1]

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

window.eval(bundle)

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
// The bar lists where you can go. It used to list the four homepage sections,
// which made every link on a text page a trip back to the homepage.
const DESTINATIONS = ['Features', 'Help', 'Guides', 'Project']
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
// Six bands and six names in two separate grids, so the only thing keeping a
// photographer under their own photograph is that both lists are built from the
// same array in the same order. Nothing else would catch a swap: the page still
// builds, still looks right, and credits the wrong person.
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

console.log('\nthe last line of the footer')
// Help, Guides and Project moved into the top nav and came out of this row, so
// what is left is the only route to these three pages anywhere on the site.
// Drop one by accident and it is reachable from nothing but the sitemap.
const lastRow = [...doc.querySelectorAll('#site-footer .base-links a')].map((a) => a.getAttribute('href')!)
for (const href of ['/alternatives', '/privacy', '/terms', 'mailto:hello@spreadpaper.app']) {
  check(`${href} is still linked`, lastRow.includes(href), lastRow.join(', '))
}
check('and nothing the top nav already carries came back',
  !lastRow.some((href) => ['/help', '/guides', '/project'].includes(href)),
  lastRow.join(', '))

const copyright = doc.querySelector('#site-footer .base-line')!.textContent!.trim()
check('the copyright line carries a four digit year', /Copyright \d{4} /.test(copyright), copyright)
check('and links the licence',
  doc.querySelector('#site-footer .base-line a')?.getAttribute('href')?.endsWith('/LICENSE') === true)

console.log(failures ? `\n${failures} FAILED` : '\nall checks passed')
process.exit(failures ? 1 : 0)
