import { PANELS, panelOf } from '../lib/displays'

/* === The bench ===========================================================
   The reader builds a desk, drops a picture on it, and places the picture
   across it.

   On a Mac the app takes the arrangement from the system, sizes, order, gaps
   and all. A web page cannot see your displays, so here the desk is described
   by hand. That is the one thing this bench does that the app does not, and the
   copy says so rather than implying the app has a display editor in it.

   Every other rig on the page has its geometry in scripts/rigs.ts and is drawn
   into the section at build time. This one cannot be, because the desk is
   whatever the reader adds. The screen sizes still come from the one place they
   are written down, src/lib/displays.ts, which the generator reads too. */

/** The four glyphs the editor's HUD really draws, from Phosphor regular. */
const GLYPH: Record<string, string> = {
  minus: 'M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128Z',
  plus: 'M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z',
  fit: 'M216,48V96a8,8,0,0,1-16,0V67.31l-50.34,50.35a8,8,0,0,1-11.32-11.32L188.69,56H160a8,8,0,0,1,0-16h48A8,8,0,0,1,216,48ZM106.34,138.34,56,188.69V160a8,8,0,0,0-16,0v48a8,8,0,0,0,8,8H96a8,8,0,0,0,0-16H67.31l50.35-50.34a8,8,0,0,0-11.32-11.32Z',
  flip: 'M213.66,181.66l-32,32a8,8,0,0,1-11.32-11.32L188.69,184H48a8,8,0,0,1,0-16H188.69l-18.35-18.34a8,8,0,0,1,11.32-11.32l32,32A8,8,0,0,1,213.66,181.66Zm-139.32-64a8,8,0,0,0,11.32-11.32L67.31,88H208a8,8,0,0,0,0-16H67.31L85.66,53.66A8,8,0,0,0,74.34,42.34l-32,32a8,8,0,0,0,0,11.32Z',
  x: 'M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z',
  image: 'M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,16V158.75l-26.07-26.06a16,16,0,0,0-22.63,0l-20,20-44-44a16,16,0,0,0-22.62,0L40,149.37V56ZM40,172l52-52,80,80H40Zm176,28H194.63l-36-36,20-20L216,181.38V200ZM144,100a12,12,0,1,1,12,12A12,12,0,0,1,144,100Z',
  monitor: 'M208,40H48A24,24,0,0,0,24,64V168a24,24,0,0,0,24,24h72v24H88a8,8,0,0,0,0,16h80a8,8,0,0,0,0-16H136V192h72a24,24,0,0,0,24-24V64A24,24,0,0,0,208,40Zm8,128a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V64a8,8,0,0,1,8-8H208a8,8,0,0,1,8,8Z',
}

const icon = (name: string) =>
  `<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false"><path d="${GLYPH[name]}"/></svg>`

/** A picture on the canvas, bundled with the page or dropped by the reader. */
type Photo = { src: string; w: number; h: number; name?: string; bundled: number }

/* The photographs that ship with the page, so the bench is usable before
   anybody drops a file and on a phone, where dropping one is awkward.

   URLs and sizes are the ones scripts/rigs.ts sanctions: one URL per
   photograph for the whole page, so a thumbnail is the same file the canvas
   draws rather than a second download. The two the canvas opens on are the
   originals; the other two are half size, which is all a thumbnail needs. */
const BUNDLED: Photo[] = [
  { src: '/photos/hero-day-2.jpg', w: 2400, h: 559, name: 'Midday over the peak', bundled: 0 },
  { src: '/photos/1200/hero-day-4.jpg', w: 1200, h: 279, name: 'The Milky Way', bundled: 1 },
  { src: '/photos/hero-beach.jpg', w: 2400, h: 559, name: 'Beach at sunset', bundled: 2 },
  { src: '/photos/1200/hero-day-3.jpg', w: 1200, h: 279, name: 'Evening light', bundled: 3 },
]

/* Wide enough that a stop is felt on the way past, narrow enough that a
   position two thirds of the way across is still reachable. Displays get a
   tighter one than the photograph, because butting two screens together wants
   to be precise rather than forgiving. */
const SNAP_PHOTO = 14
const SNAP_EDGE = 11

/* Every axis needs room either side of its middle stop, or the three snap zones
   overlap and the drag feels permanently caught. */
const MIN_SLACK = SNAP_PHOTO * 4

/* Drawn around the arrangement, so a display at the edge of the desk is not
   also at the edge of the picture. */
const CANVAS_PAD = 56

/* The seam two neighbouring displays settle into, which every rig on the site
   draws: `dual` puts 355 wide screens at x 0 and x 361. A screen is a rounded
   rectangle and the clip is the union of them all, so two rects sharing an edge
   lose the corners out of each end of the join. The seam keeps every screen
   whole, and the two frame strokes meet across it as a pair of bezels. */
const DISPLAY_GAP = 6

const ZOOM_MAX = 4
const ZOOM_STEP = 0.25

let uid = 0
const nextId = (prefix: string) => prefix + '-' + ++uid

/** A display on the desk. */
type Placed = { key: string; kind: string; x: number; y: number }

/** A box in viewBox units, with the middle it is measured from. */
type Union = { x: number; y: number; w: number; h: number; cx: number; cy: number }

type Guide = { vertical: boolean; at: number }

/** The box every screen sits inside, which is what the render keeps. */
function union(displays: Placed[]): Union {
  const x1 = Math.min(...displays.map((d) => d.x))
  const y1 = Math.min(...displays.map((d) => d.y))
  const x2 = Math.max(...displays.map((d) => d.x + panelOf(d.kind).w))
  const y2 = Math.max(...displays.map((d) => d.y + panelOf(d.kind).h))
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 }
}

/**
 * Where the photograph sits before anybody drags it: centred on the desk, at
 * its own aspect, and covering every screen with slack on both axes.
 * Covering is what stops the canvas showing through.
 *
 * Derived rather than written down, since neither half is known in advance: a
 * panorama over a portrait pair grows sideways and a square picture over
 * three monitors in a row grows down. One rule covers both.
 *
 * @param u - The box every screen sits inside.
 * @param aspect - The picture's width over its height.
 * @returns The picture's box in viewBox units.
 */
function photoBox(u: Union, aspect: number) {
  const h = Math.max(u.h + MIN_SLACK * 2, (u.w + MIN_SLACK * 2) / aspect)
  const w = h * aspect
  return { x: u.cx - w / 2, y: u.cy - h / 2, w, h }
}

function panRange(u: Union, box: { w: number; h: number }, zoom: number) {
  return { x: (box.w * zoom - u.w) / 2, y: (box.h * zoom - u.h) / 2 }
}

function settle(v: number, limit: number, threshold: number): number | null {
  for (const stop of [-limit, 0, limit]) {
    if (Math.abs(v - stop) <= threshold) return stop
  }
  return null
}

function benchMarkup() {
  const id = nextId('bn')

  const thumbs = BUNDLED.map(
    (p, i) => `
    <button class="bn-thumb pc-focus" type="button" data-photo="${i}" aria-pressed="${i === 0}"
            title="${p.name}" aria-label="Use the photograph called ${p.name}">
      <img src="${p.src}" alt="" width="${p.w}" height="${p.h}" loading="lazy" decoding="async">
    </button>`
  ).join('')

  const menuItems = PANELS.map(
    (p) => `
    <button class="bn-menu-item pc-focus" type="button" role="menuitem" data-add="${p.id}">
      ${p.name}<span>${p.pixels}</span>
    </button>`
  ).join('')

  const tools = (
    [
      ['minus', 'Zoom out', 'out'],
      ['plus', 'Zoom in', 'in'],
      ['fit', 'Fit to the canvas', 'fit'],
      /* Flip is a toggle, so it carries aria-pressed from the markup rather than
         gaining it on the first render: a button that only becomes a toggle once
         the script runs announces the wrong thing in between. */
      ['flip', 'Mirror horizontally', 'flip'],
    ] as const
  ).map(
    ([g, label, act]) =>
      `<button class="bn-tool pc-focus" type="button" data-act="${act}" title="${label}" aria-label="${label}"${act === 'flip' ? ' aria-pressed="false"' : ''}>${icon(g)}</button>`
  ).join('')

  return `
  <div class="bn" data-bench>
    <div>
      <div class="bn-panel">
        <p class="bn-panel-title">The wallpaper</p>
        <div class="bn-thumbs">${thumbs}</div>
        <button class="cd-button cd-button-secondary bn-choose pc-focus" type="button" data-choose>
          ${icon('image')}Choose a wallpaper
        </button>
        <input class="sr-only" type="file" accept="image/*" data-file id="${id}-file">
        <label class="sr-only" for="${id}-file">Choose a wallpaper from your Mac</label>
        <p class="bn-filename" data-filename>Drop one on the canvas, or choose a file.</p>
      </div>

      <div class="bn-panel">
        <p class="bn-panel-title">Your displays</p>
        <div class="bn-list" data-list></div>
        <div class="bn-add-wrap">
          <button class="cd-button cd-button-secondary bn-add pc-focus" type="button"
                  data-addbutton aria-haspopup="menu" aria-expanded="false">Add a display</button>
          <div class="bn-menu" role="menu" aria-label="Add a display" data-menu hidden>${menuItems}</div>
        </div>
      </div>
    </div>

    <div class="bn-stage">
      <div class="bn-canvas-box" data-box>
        <svg class="bn-canvas" data-canvas data-mode="arrange" preserveAspectRatio="xMidYMid meet"
             role="img" aria-label="The editor canvas, with your displays drawn on it and one wallpaper across them." focusable="false"></svg>
        <p class="bn-readout" data-readout aria-live="polite">
          <span class="bn-readout-dot" aria-hidden="true"></span>
          <span data-readout-text>Zoom 100%</span>
        </p>
      </div>

      <div class="bn-bar">
        <div class="bn-track" role="toolbar" aria-label="Canvas controls">
          <span class="bn-track-label" aria-hidden="true">Drag</span>

          <div class="bn-seg" role="radiogroup" aria-label="What you drag on the canvas" data-seg>
            <span class="bn-seg-thumb" data-seg-thumb aria-hidden="true"></span>
            <button class="bn-seg-item pc-focus" type="button" role="radio" data-mode-set="arrange" aria-checked="true" tabindex="0" aria-label="Drag the displays">${icon('monitor')}Displays</button>
            <button class="bn-seg-item pc-focus" type="button" role="radio" data-mode-set="place" aria-checked="false" tabindex="-1" aria-label="Drag the wallpaper">${icon('image')}Wallpaper</button>
          </div>

          <span class="bn-track-rule" aria-hidden="true"></span>

          <div class="bn-tools" role="group" aria-label="Wallpaper controls">${tools}</div>
        </div>

        <button class="bn-reset pc-focus" type="button" data-reset>Start again</button>
      </div>

      <p class="bn-hint" data-hint></p>
    </div>
  </div>`
}

/**
 * Binds one mounted bench. Everything the reader changes lives in `state`, and
 * every drawing is a pure function of it, so there is one path to the screen
 * and no way for the list, the canvas and the readout to disagree.
 */
function bench(root: HTMLElement) {
  const el = {
    box: root.querySelector<HTMLElement>('[data-box]')!,
    canvas: root.querySelector<SVGSVGElement>('[data-canvas]')!,
    list: root.querySelector<HTMLElement>('[data-list]')!,
    addButton: root.querySelector<HTMLButtonElement>('[data-addbutton]')!,
    menu: root.querySelector<HTMLElement>('[data-menu]')!,
    file: root.querySelector<HTMLInputElement>('[data-file]')!,
    choose: root.querySelector<HTMLButtonElement>('[data-choose]')!,
    filename: root.querySelector<HTMLElement>('[data-filename]')!,
    readout: root.querySelector<HTMLElement>('[data-readout]')!,
    readoutText: root.querySelector<HTMLElement>('[data-readout-text]')!,
    hint: root.querySelector<HTMLElement>('[data-hint]')!,
    reset: root.querySelector<HTMLButtonElement>('[data-reset]')!,
  }
  if (!el.canvas || !el.list) return

  /* Two 27-inch monitors, bottoms level, one bezel apart: the desk most people
     arrive with, and the one that makes adding a third the obvious next move. */
  const START = (): Placed[] => [
    { key: 'a', kind: 'monitor27', x: 0, y: 0 },
    { key: 'b', kind: 'monitor27', x: 361, y: 0 },
  ]

  let objectUrl: string | null = null
  let keySeed = 0

  const state = {
    photo: BUNDLED[0] as Photo,
    displays: START(),
    selected: 'a',
    place: { dx: 0, dy: 0, zoom: 1, flip: false },
    mode: 'arrange',
    guides: [] as Guide[],
  }

  const aspect = () => state.photo.w / state.photo.h
  const u = () => union(state.displays)
  const box = () => photoBox(u(), aspect())

  /* --- Drawing --- */

  function viewBox() {
    const b = u()
    return {
      x: b.x - CANVAS_PAD,
      y: b.y - CANVAS_PAD,
      w: b.w + CANVAS_PAD * 2,
      h: b.h + CANVAS_PAD * 2,
    }
  }

  function draw() {
    const vb = viewBox()
    const b = u()
    const p = box()
    const { dx, dy, zoom, flip } = state.place
    const clipId = nextId('bn-clip')

    el.canvas.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`)
    el.canvas.setAttribute('data-mode', state.mode)

    const screens = state.displays.map((d) => {
      const pn = panelOf(d.kind)
      return `<rect x="${d.x}" y="${d.y}" width="${pn.w}" height="${pn.h}" rx="10"/>`
    }).join('')

    const frames = state.displays.map((d) => {
      const pn = panelOf(d.kind)
      return `<rect class="rig-frame" x="${d.x}" y="${d.y}" width="${pn.w}" height="${pn.h}" rx="10"/>`
    }).join('')

    /* Mirror first, then scale, then move, all about the middle of the
       arrangement, so a flip turns the picture on its own axis and a zoom grows
       out of the point the displays are centred on. */
    /* Zoom rides a property on the canvas, which outlives this group, so a
       rebuild picks the value up mid-transition. Pan stays literal: it moves
       every frame of a drag and must not lag. */
    el.canvas.style.setProperty('--bn-zoom', String(zoom))
    const place = `transform-origin: ${b.cx}px ${b.cy}px; transform: translate(${dx}px, ${dy}px) scale(var(--bn-zoom)) scaleX(${flip ? -1 : 1})`
    const img = (cls: string) =>
      `<g style="${place}"><image class="${cls}" href="${state.photo.src}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" preserveAspectRatio="xMidYMid slice"/></g>`

    /* Hit targets only in arrange mode. In place mode the whole canvas is the
       drag surface, and a transparent rect over each display would swallow the
       pointer before it ever reached it. */
    const hits =
      state.mode === 'arrange'
        ? state.displays.map((d) => {
            const pn = panelOf(d.kind)
            return `<rect class="bn-hit" data-display="${d.key}" x="${d.x}" y="${d.y}" width="${pn.w}" height="${pn.h}" rx="10"/>`
          }).join('')
        : ''

    const sel = state.displays.find((d) => d.key === state.selected)
    const outline =
      sel && state.mode === 'arrange'
        ? `<rect class="bn-outline" data-on x="${sel.x - 3}" y="${sel.y - 3}" width="${panelOf(sel.kind).w + 6}" height="${panelOf(sel.kind).h + 6}" rx="12"/>`
        : ''

    const guides = state.guides.map((g) =>
      g.vertical
        ? `<line class="bn-guide" x1="${g.at}" y1="${vb.y}" x2="${g.at}" y2="${vb.y + vb.h}"/>`
        : `<line class="bn-guide" x1="${vb.x}" y1="${g.at}" x2="${vb.x + vb.w}" y2="${g.at}"/>`
    ).join('')

    el.canvas.innerHTML = `
      <defs><clipPath id="${clipId}">${screens}</clipPath></defs>
      <rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="#0b0b0e"/>
      ${img('rig-bleed')}
      <rect class="rig-crop" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8"/>
      <g clip-path="url(#${clipId})">${img('rig-photo')}${frames}</g>
      ${guides}
      ${outline}
      ${hits}`
  }

  let listKey = ''

  /* Selection is an attribute on a row that already exists, so it is flipped in
     place rather than redrawn. */
  function markSelected() {
    el.list.querySelectorAll('[data-row]').forEach((r) => {
      r.setAttribute('aria-current', String(r.getAttribute('data-row') === state.selected))
    })
  }

  function drawList() {
    /* Rebuilt only when the set of displays changes. Moving one does not change
       it, and neither does selecting one, so the row a reader is holding an
       arrow key on survives both. Rebuilding under their own keypress would
       destroy that row and take the focus with it. */
    const key = state.displays.map((d) => d.key + ':' + d.kind).join(',')
    if (key === listKey) {
      markSelected()
      return
    }
    /* A rebuild recreates every row, so only a key that was not here a moment
       ago arrives. The first build is the bench itself, which has to be
       complete in its first frame. */
    const first = listKey === ''
    const before = new Set(listKey ? listKey.split(',') : [])
    listKey = key

    el.list.innerHTML = state.displays.map((d) => {
      const pn = panelOf(d.kind)
      /* The chip keeps the panel's real aspect, capped at 18px on its long
         edge, so a portrait row is visibly a portrait row. */
      const k = 18 / Math.max(pn.w, pn.h)
      return `
        <div class="bn-row pc-focus" role="button" tabindex="0" data-row="${d.key}"
             ${first || before.has(d.key + ':' + d.kind) ? '' : 'data-entering'}
             aria-current="${d.key === state.selected}"
             aria-label="${pn.name}, ${pn.pixels}. Arrow keys move it.">
          <span class="bn-row-chip" aria-hidden="true"><span style="width:${(pn.w * k).toFixed(1)}px;height:${(pn.h * k).toFixed(1)}px"></span></span>
          <span class="bn-row-text">
            <span class="bn-row-name">${pn.name}</span>
            <span class="bn-row-spec">${pn.pixels}</span>
          </span>
          <button class="bn-remove pc-focus" type="button" data-remove="${d.key}"
                  aria-label="Remove this ${pn.name}"${state.displays.length < 2 ? ' disabled' : ''}>${icon('x')}</button>
        </div>`
    }).join('')

    /* One frame holding the entering state, so the transition has somewhere to
       run from. */
    const entering = el.list.querySelectorAll('[data-entering]')
    if (entering.length) {
      requestAnimationFrame(() => entering.forEach((row) => row.removeAttribute('data-entering')))
    }
  }

  function drawBar() {
    const b = u()
    const p = box()
    const limit = panRange(b, p, state.place.zoom)
    const hitX = settle(state.place.dx, limit.x, SNAP_PHOTO)
    const hitY = settle(state.place.dy, limit.y, SNAP_PHOTO)
    const snapped = hitX !== null || hitY !== null

    el.readout.toggleAttribute('data-snapped', snapped)
    el.readoutText.textContent = [
      'Zoom ' + Math.round(state.place.zoom * 100) + '%',
      state.place.flip ? 'Mirrored' : null,
      hitX === 0 && hitY === 0 ? 'Centred' : snapped ? 'Snapped' : null,
    ].filter(Boolean).join(', ')

    /* Roving tabindex: a radiogroup is one tab stop, and the arrows move
       inside it. The thumb is measured rather than assumed, since the two
       labels are not the same width. */
    const seg = root.querySelector<HTMLElement>('[data-seg-thumb]')
    root.querySelectorAll<HTMLElement>('[data-mode-set]').forEach((btn) => {
      const on = btn.dataset.modeSet === state.mode
      btn.setAttribute('aria-checked', String(on))
      btn.tabIndex = on ? 0 : -1
      if (on && seg) {
        seg.style.width = btn.offsetWidth + 'px'
        seg.style.transform = `translateX(${btn.offsetLeft}px)`
      }
    })

    const out = root.querySelector<HTMLButtonElement>('[data-act="out"]')
    const inn = root.querySelector<HTMLButtonElement>('[data-act="in"]')
    const flip = root.querySelector<HTMLButtonElement>('[data-act="flip"]')
    if (out) out.disabled = state.place.zoom <= 1.001
    if (inn) inn.disabled = state.place.zoom >= ZOOM_MAX - 0.001
    if (flip) flip.setAttribute('aria-pressed', String(state.place.flip))

    el.hint.textContent =
      state.mode === 'arrange'
        ? 'Drag a display to move it. It snaps to the edges and the middles of the others, and pushes them aside when it arrives. On a Mac the app reads this arrangement from the system.'
        : 'Drag the wallpaper to move it across every display at once. It snaps to the middle of the arrangement and to its edges as it passes them.'
  }

  function render() {
    clampPlace()
    draw()
    drawList()
    drawBar()
  }

  function clampPlace() {
    const limit = panRange(u(), box(), state.place.zoom)
    state.place.dx = Math.max(-limit.x, Math.min(limit.x, state.place.dx))
    state.place.dy = Math.max(-limit.y, Math.min(limit.y, state.place.dy))
  }

  /* --- Geometry of the pointer ---
     With preserveAspectRatio "meet" the drawing is scaled by the smaller of the
     two ratios and letterboxed in the other axis, so units per CSS pixel is the
     larger of them. Measured per drag, because the box is fluid and the viewBox
     changes every time a display is added. */
  function unitsPerPixel() {
    const vb = viewBox()
    const rect = el.canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return 1
    return Math.max(vb.w / rect.width, vb.h / rect.height)
  }

  /* --- Arranging displays --- */

  /**
   * Finds the alignments a dragged display is close enough to be caught by, and
   * returns the position it should take plus the guides to draw for it.
   *
   * Two families, both of them what System Settings does: line an edge or a
   * middle up with a neighbour's, or butt the two together so their frames
   * touch. Adjacency is what makes a spread wallpaper work, so it is offered on
   * both axes and takes the same threshold.
   */
  function snapDisplay(moving: Placed, rawX: number, rawY: number) {
    const pn = panelOf(moving.kind)
    const others = state.displays.filter((d) => d.key !== moving.key)
    const guides: Guide[] = []
    let x = rawX
    let y = rawY
    let bestX = SNAP_EDGE + 1
    let bestY = SNAP_EDGE + 1

    for (const o of others) {
      const on = panelOf(o.kind)

      const candidatesX = [
        { value: o.x, guide: o.x },
        { value: o.x + on.w - pn.w, guide: o.x + on.w },
        { value: o.x + on.w / 2 - pn.w / 2, guide: o.x + on.w / 2 },
        { value: o.x + on.w + DISPLAY_GAP, guide: o.x + on.w },
        { value: o.x - pn.w - DISPLAY_GAP, guide: o.x },
      ]
      for (const c of candidatesX) {
        const d = Math.abs(rawX - c.value)
        if (d <= SNAP_EDGE && d < bestX) {
          bestX = d
          x = c.value
          guides.push({ vertical: true, at: c.guide })
        }
      }

      const candidatesY = [
        { value: o.y, guide: o.y },
        { value: o.y + on.h - pn.h, guide: o.y + on.h },
        { value: o.y + on.h / 2 - pn.h / 2, guide: o.y + on.h / 2 },
        { value: o.y + on.h + DISPLAY_GAP, guide: o.y + on.h },
        { value: o.y - pn.h - DISPLAY_GAP, guide: o.y },
      ]
      for (const c of candidatesY) {
        const d = Math.abs(rawY - c.value)
        if (d <= SNAP_EDGE && d < bestY) {
          bestY = d
          y = c.value
          guides.push({ vertical: false, at: c.guide })
        }
      }
    }

    /* Only the winning guide on each axis is drawn. Every near miss collected
       above would otherwise put a dashed line through the canvas for an
       alignment the display did not actually take. */
    const kept: Guide[] = []
    const winner = (vertical: boolean) => guides.filter((g) => g.vertical === vertical).pop()
    if (bestX <= SNAP_EDGE) {
      const g = winner(true)
      if (g) kept.push(g)
    }
    if (bestY <= SNAP_EDGE) {
      const g = winner(false)
      if (g) kept.push(g)
    }

    return { x, y, guides: kept }
  }

  /**
   * Shoves every other display clear of `moving`, which holds its ground.
   * A push can start another, so it runs until the desk settles.
   *
   * Real displays cannot overlap, so a desk that lets them is describing an
   * arrangement macOS would not accept. The one under the pointer wins because
   * it is the one being asked for; the rest give way along whichever axis they
   * are least deep into it, which is the direction they were pushed from.
   *
   * @param moving - The display the reader is placing.
   */
  function clearOverlaps(anchor: Placed) {
    const middle = (d: Placed) => {
      const pn = panelOf(d.kind)
      return { x: d.x + pn.w / 2, y: d.y + pn.h / 2 }
    }

    /* Distance from the display the reader placed, so a push always travels
       outwards: of any two that collide, the one further out is the one that
       gives way, and it carries the collision away rather than back. */
    const outerOf = (a: Placed, b: Placed) => {
      if (a.key === anchor.key) return b
      if (b.key === anchor.key) return a
      const c = middle(anchor)
      const da = middle(a)
      const db = middle(b)
      const ra = (da.x - c.x) ** 2 + (da.y - c.y) ** 2
      const rb = (db.x - c.x) ** 2 + (db.y - c.y) ** 2
      return rb >= ra ? b : a
    }

    /* Every pair, not only the pairs the anchor is in: a display shoved off one
       neighbour lands on the next one along, and nothing would notice. */
    for (let pass = 0; pass < 60; pass++) {
      let moved = false

      for (let i = 0; i < state.displays.length; i++) {
        for (let j = i + 1; j < state.displays.length; j++) {
          const a = state.displays[i]
          const b = state.displays[j]
          const pa = panelOf(a.kind)
          const pb = panelOf(b.kind)

          /* How far `b` must travel each way to leave a seam beside `a`. All
             four are positive only while the two actually overlap. */
          const right = a.x + pa.w + DISPLAY_GAP - b.x
          const left = b.x + pb.w + DISPLAY_GAP - a.x
          const down = a.y + pa.h + DISPLAY_GAP - b.y
          const up = b.y + pb.h + DISPLAY_GAP - a.y
          if (right <= 0 || left <= 0 || down <= 0 || up <= 0) continue

          /* The anchor never yields, and otherwise the outer one does. The
             distances are measured for `b`, so `a` travels the other way. */
          const victim = outerOf(a, b)
          const way = victim === b ? 1 : -1
          const least = Math.min(right, left, down, up)
          if (least === right) victim.x += way * right
          else if (least === left) victim.x -= way * left
          else if (least === down) victim.y += way * down
          else victim.y -= way * up
          moved = true
        }
      }

      if (!moved) return
    }
  }

  /* --- Dragging --- */

  type Drag = { kind: 'display' | 'photo'; key?: string; ox: number; oy: number; sx: number; sy: number; k: number; pointerId: number }
  let drag: Drag | null = null

  el.canvas.addEventListener('pointerdown', (e) => {
    const target = (e.target as Element | null)?.closest?.('[data-display]') ?? null
    const k = unitsPerPixel()

    if (state.mode === 'arrange') {
      if (!target) return
      const key = target.getAttribute('data-display') ?? ''
      const d = state.displays.find((item) => item.key === key)
      if (!d) return
      state.selected = key
      drag = { kind: 'display', key, ox: e.clientX, oy: e.clientY, sx: d.x, sy: d.y, k, pointerId: e.pointerId }
    } else {
      drag = { kind: 'photo', ox: e.clientX, oy: e.clientY, sx: state.place.dx, sy: state.place.dy, k, pointerId: e.pointerId }
    }

    el.canvas.setPointerCapture(e.pointerId)
    el.canvas.setAttribute('data-dragging', '')
    render()
  })

  el.canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    const mx = (e.clientX - drag.ox) * drag.k
    const my = (e.clientY - drag.oy) * drag.k

    if (drag.kind === 'display') {
      const d = state.displays.find((item) => item.key === drag!.key)
      if (!d) return
      const snap = snapDisplay(d, drag.sx + mx, drag.sy + my)
      d.x = snap.x
      d.y = snap.y
      state.guides = snap.guides
    } else {
      state.place.dx = drag.sx + mx
      state.place.dy = drag.sy + my
      const limit = panRange(u(), box(), state.place.zoom)
      const hitX = settle(state.place.dx, limit.x, SNAP_PHOTO)
      const hitY = settle(state.place.dy, limit.y, SNAP_PHOTO)
      state.guides = []
      if (hitX === 0) state.guides.push({ vertical: true, at: u().cx })
      if (hitY === 0) state.guides.push({ vertical: false, at: u().cy })
      if (hitX !== null) state.place.dx = hitX
      if (hitY !== null) state.place.dy = hitY
    }
    render()
  })

  const release = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    /* The desk is made valid here rather than during the drag. Shoving
       neighbours around under a moving pointer makes the whole arrangement
       squirm, and the reader is aiming at a target that is still moving. */
    if (drag.kind === 'display') {
      const d = state.displays.find((item) => item.key === drag!.key)
      if (d) clearOverlaps(d)
    }
    drag = null
    state.guides = []
    el.canvas.removeAttribute('data-dragging')
    render()
  }

  el.canvas.addEventListener('pointerup', release)
  el.canvas.addEventListener('pointercancel', release)

  /* --- The picture --- */

  function usePhoto(next: Photo, label: string) {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      objectUrl = null
    }
    state.photo = next
    state.place = { dx: 0, dy: 0, zoom: 1, flip: false }
    el.filename.textContent = label
    root.querySelectorAll<HTMLElement>('[data-photo]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(Number(btn.dataset.photo) === next.bundled))
    })
    render()
  }

  function useFile(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) {
      el.filename.textContent = 'That file is not an image. Try a JPEG, PNG or HEIC.'
      return
    }
    const url = URL.createObjectURL(file)
    const probe = new Image()
    probe.onload = () => {
      /* The natural size is read before the picture is used, because every box
         on the canvas is derived from its aspect and guessing it wrong would
         squash the first frame before correcting itself. */
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      objectUrl = url
      state.photo = { src: url, w: probe.naturalWidth, h: probe.naturalHeight, bundled: -1 }
      state.place = { dx: 0, dy: 0, zoom: 1, flip: false }
      el.filename.textContent = `${file.name}, ${probe.naturalWidth} by ${probe.naturalHeight}`
      root.querySelectorAll('[data-photo]').forEach((btn) => btn.setAttribute('aria-pressed', 'false'))
      render()
    }
    probe.onerror = () => {
      URL.revokeObjectURL(url)
      el.filename.textContent = 'That image could not be read. Try another file.'
    }
    probe.src = url
  }

  el.choose.addEventListener('click', () => el.file.click())
  el.file.addEventListener('change', () => useFile(el.file.files?.[0]))

  root.querySelectorAll<HTMLElement>('[data-photo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.photo)
      usePhoto(BUNDLED[i], BUNDLED[i].name + ', a photograph that ships with the page.')
    })
  })

  /* Drop anywhere on the stage. dragover has to be cancelled or the browser
     navigates to the file instead of handing it over. */
  ;['dragenter', 'dragover'].forEach((type) =>
    el.box.addEventListener(type, (e) => {
      e.preventDefault()
      el.box.setAttribute('data-dropping', '')
    })
  )
  ;['dragleave', 'drop'].forEach((type) =>
    el.box.addEventListener(type, (e) => {
      e.preventDefault()
      el.box.removeAttribute('data-dropping')
    })
  )

  el.box.addEventListener('drop', (e) => {
    const file = (e as DragEvent).dataTransfer?.files?.[0]
    if (file) useFile(file)
  })

  /* --- Displays --- */

  /** Puts a new display to the right of the desk, level with the tallest run. */
  function addDisplay(kind: string) {
    const b = u()
    keySeed += 1
    state.displays.push({ key: 'k' + keySeed, kind, x: b.x + b.w + DISPLAY_GAP, y: b.y })
    state.selected = 'k' + keySeed
    closeMenu()
    render()
  }

  function removeDisplay(key: string) {
    if (state.displays.length < 2) return

    /* The row leaves the DOM as a copy of itself rather than by holding up the
       state, so the desk loses the display the moment it is asked to. Measured
       first: a grid row has no height to collapse from once it is out of one. */
    const going = el.list.querySelector<HTMLElement>(`[data-row="${key}"]`)
    const leaving = going?.cloneNode(true) as HTMLElement | undefined
    const at = going ? [...el.list.children].indexOf(going) : -1
    if (leaving && going) {
      leaving.style.height = going.offsetHeight + 'px'
      leaving.removeAttribute('data-row')
      leaving.setAttribute('aria-hidden', 'true')
      leaving.querySelectorAll('button').forEach((b) => b.setAttribute('tabindex', '-1'))
    }

    state.displays = state.displays.filter((d) => d.key !== key)
    if (!state.displays.some((d) => d.key === state.selected)) state.selected = state.displays[0].key
    render()

    if (leaving) {
      el.list.insertBefore(leaving, el.list.children[at] ?? null)
      requestAnimationFrame(() => leaving.setAttribute('data-leaving', ''))
      const drop = () => leaving.remove()
      leaving.addEventListener('transitionend', (e) => {
        if (e.propertyName === 'height') drop()
      })
      /* jsdom and a reduced-motion reader both finish without firing one. */
      setTimeout(drop, 400)
    }

    el.addButton.focus()
  }

  /* The panel stays mounted while it animates out, so `hidden` cannot say
     whether the menu is open. aria-expanded can. */
  const menuOpen = () => el.addButton.getAttribute('aria-expanded') === 'true'

  function openMenu() {
    el.menu.hidden = false
    el.addButton.setAttribute('aria-expanded', 'true')
    requestAnimationFrame(() => el.menu.setAttribute('data-open', ''))
    el.menu.querySelector<HTMLButtonElement>('[data-add]')?.focus()
  }

  function closeMenu() {
    if (!menuOpen()) return
    el.addButton.setAttribute('aria-expanded', 'false')
    el.menu.removeAttribute('data-open')
    el.menu.addEventListener('transitionend', function done(e) {
      if (e.propertyName !== 'opacity') return
      el.menu.removeEventListener('transitionend', done)
      if (!menuOpen()) el.menu.hidden = true
    })
  }

  el.addButton.addEventListener('click', () => {
    if (menuOpen()) closeMenu()
    else openMenu()
  })

  el.menu.addEventListener('click', (e) => {
    const item = (e.target as Element | null)?.closest('[data-add]')
    if (item) addDisplay(item.getAttribute('data-add') ?? '')
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuOpen()) {
      closeMenu()
      el.addButton.focus()
    }
  })

  document.addEventListener('pointerdown', (e) => {
    if (!menuOpen()) return
    const target = e.target as Node
    if (!el.menu.contains(target) && target !== el.addButton) closeMenu()
  })

  el.list.addEventListener('click', (e) => {
    const target = e.target as Element | null
    const remove = target?.closest('[data-remove]')
    if (remove) {
      removeDisplay(remove.getAttribute('data-remove') ?? '')
      return
    }
    const row = target?.closest('[data-row]')
    if (row) {
      state.selected = row.getAttribute('data-row') ?? state.selected
      render()
    }
  })

  /* Arrow keys nudge the selected display, which is the keyboard road to the
     drag. */
  el.list.addEventListener('keydown', (e) => {
    const row = (e.target as Element | null)?.closest('[data-row]')
    if (!row) return
    const key = row.getAttribute('data-row') ?? ''

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      state.selected = key
      render()
      return
    }

    const step = e.shiftKey ? 1 : 12
    const moves: Record<string, [number, number] | undefined> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()

    const d = state.displays.find((item) => item.key === key)
    if (!d) return
    state.selected = key
    const snap = snapDisplay(d, d.x + move[0], d.y + move[1])
    d.x = snap.x
    d.y = snap.y
    clearOverlaps(d)
    render()
  })

  /* --- The control bar --- */

  const modes = [...root.querySelectorAll<HTMLElement>('[data-mode-set]')]

  function setMode(mode: string, moveFocus = false) {
    state.mode = mode
    state.guides = []
    render()
    if (moveFocus) modes.find((b) => b.dataset.modeSet === mode)?.focus()
  }

  modes.forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.modeSet ?? 'arrange'))
  })

  root.querySelector('[data-seg]')?.addEventListener('keydown', (event) => {
    const e = event as KeyboardEvent
    const at = modes.findIndex((b) => b.dataset.modeSet === state.mode)
    let next = at
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (at + 1) % modes.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (at - 1 + modes.length) % modes.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = modes.length - 1
    else return
    e.preventDefault()
    setMode(modes[next].dataset.modeSet ?? 'arrange', true)
  })

  root.querySelectorAll<HTMLElement>('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.act
      if (act === 'in') state.place.zoom = Math.min(ZOOM_MAX, state.place.zoom + ZOOM_STEP)
      else if (act === 'out') state.place.zoom = Math.max(1, state.place.zoom - ZOOM_STEP)
      else if (act === 'fit') state.place = { ...state.place, dx: 0, dy: 0, zoom: 1 }
      else if (act === 'flip') state.place.flip = !state.place.flip
      render()
    })
  })

  el.reset.addEventListener('click', () => {
    keySeed = 0
    state.displays = START()
    state.selected = 'a'
    state.mode = 'arrange'
    state.guides = []
    usePhoto(BUNDLED[0], 'Drop one on the canvas, or choose a file.')
  })

  render()
}

/**
 * Writes the bench into every `[data-bench-mount]` and takes down the still
 * canvas beside it.
 *
 * The mount ships empty and `hidden`, and `[data-bench-still]` holds the
 * generated rig that is the whole figure without this script, so the section
 * reads either way.
 */
export function setupEditorBench() {
  document.querySelectorAll<HTMLElement>('[data-bench-mount]').forEach((mount) => {
    mount.innerHTML = benchMarkup()
    const root = mount.querySelector<HTMLElement>('[data-bench]')
    if (!root) return
    bench(root)
    mount.closest('figure')?.querySelector('[data-bench-still]')?.setAttribute('hidden', '')
    mount.hidden = false
    /* Armed a frame late, or the thumb grows out of nothing on load instead of
       sitting where it belongs. */
    requestAnimationFrame(() => root.querySelector('[data-seg]')?.setAttribute('data-ready', ''))
  })
}
