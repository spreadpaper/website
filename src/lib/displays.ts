// The real displays the page draws, in the units every rig is measured in.
//
// Shared rather than owned by the rig generator, because two places now draw
// screens: `scripts/rigs.ts` writes the fixed rigs into the sections at build
// time, and the editor bench builds a desk in the browser out of whatever the
// reader adds. Both take their sizes from here, so a screen cannot come out one
// size in a section and another on the canvas beside it.

/** ViewBox units per inch of real screen height, so a 27-inch screen is 200 units tall. */
export const K = 15.09

/** A screen at true size, before a rig or a desk places it. */
export type Size = { w: number; h: number }

/**
 * Real screens, in viewBox units. A laptop reads as a laptop only at true size.
 *
 * The four the rigs already draw are the numbers those rigs are checked
 * against and must not move. The 24 and the 32 are new here, at the size the
 * same arithmetic gives them: a 16 by 9 panel of diagonal d is d * 9 / 18.358
 * inches tall, times K.
 */
export const SCREEN = {
  monitor24: { w: 316, h: 178 },
  monitor27: { w: 355, h: 200 },
  monitor27Portrait: { w: 200, h: 355 },
  monitor32: { w: 421, h: 237 },
  ultrawide34: { w: 474, h: 203 },
  laptop14: { w: 181, h: 117 },
} satisfies Record<string, Size>

/** One display the bench can put on a desk. */
export type Panel = Size & {
  id: string
  /** What the reader calls it, which is the size rather than a model. */
  name: string
  /** What it reports to the system, for the row under the name. */
  pixels: string
}

/**
 * What `Add a display` offers, widest last so the menu reads as a scale.
 *
 * Every one of these is a display somebody actually owns, and the pixel counts
 * are the panels' real ones rather than plausible numbers, because a reader who
 * has this monitor will check.
 */
export const PANELS: Panel[] = [
  { id: 'laptop14', name: 'MacBook Pro 14-inch', pixels: '3024 by 1964', ...SCREEN.laptop14 },
  { id: 'monitor24', name: '24-inch', pixels: '1920 by 1080', ...SCREEN.monitor24 },
  { id: 'monitor27', name: '27-inch', pixels: '2560 by 1440', ...SCREEN.monitor27 },
  { id: 'monitor27Portrait', name: '27-inch, on its end', pixels: '1440 by 2560', ...SCREEN.monitor27Portrait },
  { id: 'monitor32', name: '32-inch', pixels: '3840 by 2160', ...SCREEN.monitor32 },
  { id: 'ultrawide34', name: '34-inch ultrawide', pixels: '3440 by 1440', ...SCREEN.ultrawide34 },
]

/** Corner radius a drawn screen takes, matching the rigs. */
export const SCREEN_RX = 10

export const panelOf = (id: string): Panel => PANELS.find((p) => p.id === id) ?? PANELS[2]
