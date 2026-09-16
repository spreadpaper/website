const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

/**
 * Spells a small count so a sentence reads as written rather than tallied.
 * Anything past twelve stays in digits, where words slow a reader.
 *
 * @param count - How many of the thing there are.
 * @returns The count as a word, or as digits once it grows.
 */
function spell(count: number): string {
  return NUMBERS[count] ?? String(count)
}

/**
 * Counts people, noun and all. The count comes from an API at build time, so
 * the sentence has to hold at every number it can answer with.
 *
 * @param count - How many people there are.
 * @returns The count spelled out, with the noun that agrees with it.
 */
export function people(count: number): string {
  return `${spell(count)} ${count === 1 ? 'person' : 'people'}`
}
