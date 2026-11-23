/**
 * smoothing.js
 * ------------
 * Makes the recognized letter steady instead of flickery.
 *
 * The camera gives us about 30 pictures (frames) per second, and k-NN
 * guesses a letter for each one. Hands wobble, so the raw guesses can jump
 * around: "B B B D B B B S B B". Two tricks calm this down:
 *
 *   1. MAJORITY VOTE: look at the last 10 guesses and pick the most common
 *      one. It only counts as "stable" if it wins at least 60% of them.
 *   2. HOLD TO LOCK: the stable letter must stay the same for 0.5 seconds
 *      before we "lock it in" (accept it as the user's answer). The lock
 *      fires only ONCE per hold, so holding "B" for 3 seconds still counts
 *      as one "B".
 *
 * Time is passed in as a number (milliseconds) instead of read from the
 * clock, which makes this file easy to unit test.
 */

/** How many recent guesses take part in the vote (about 1/3 second of video). */
export const DEFAULT_WINDOW_SIZE = 10;

/** How much of the window must agree for a letter to be "stable" (60%). */
export const DEFAULT_MIN_AGREEMENT = 0.6;

/** How long (ms) a stable letter must be held before it locks in. */
export const DEFAULT_HOLD_MS = 500;

/**
 * Finds the most common value in a list.
 * @param {Array<string|null>} labels - Recent guesses. null means "no hand / not sure".
 * @returns {{label:string|null, count:number}} The winner and how many votes it got.
 */
export function majorityVote(labels) {
  const counts = new Map();
  for (const label of labels) {
    const previous = counts.get(label) ?? 0;
    counts.set(label, previous + 1);
  }

  let bestLabel = null;
  let bestCount = 0;
  for (const [label, count] of counts) {
    // Strictly greater: on a tie, the label we saw first keeps the lead.
    if (count > bestCount) {
      bestLabel = label;
      bestCount = count;
    }
  }
  return { label: bestLabel, count: bestCount };
}

/**
 * Keeps track of recent guesses and decides when a letter is locked in.
 */
export class LetterSmoother {
  /**
   * Creates a smoother.
   * @param {{windowSize?:number, minAgreement?:number, holdMs?:number}} options
   *   windowSize = guesses in the vote, minAgreement = fraction that must agree,
   *   holdMs = how long to hold before locking.
   */
  constructor(options = {}) {
    this.windowSize = options.windowSize ?? DEFAULT_WINDOW_SIZE;
    this.minAgreement = options.minAgreement ?? DEFAULT_MIN_AGREEMENT;
    this.holdMs = options.holdMs ?? DEFAULT_HOLD_MS;
    this.reset();
  }

  /**
   * Forgets everything, as if the smoother were brand new.
   * Useful after a correct answer so the same letter can be signed again.
   * @returns {void}
   */
  reset() {
    this.recentGuesses = [];
    this.currentLetter = null;
    this.stableSince = 0;
    this.alreadyLocked = false;
  }

  /**
   * Adds one new guess and reports the smoothed result.
   * @param {string|null} letter - This frame's guess (null = no hand or low confidence).
   * @param {number} nowMs - The current time in milliseconds.
   * @returns {{stableLetter:string|null, holdProgress:number, lockedLetter:string|null}}
   *   stableLetter = the steady letter right now (or null),
   *   holdProgress = 0 to 1, how close we are to locking,
   *   lockedLetter = a letter ONLY on the one frame it locks in, otherwise null.
   */
  update(letter, nowMs) {
    this.recentGuesses.push(letter);
    if (this.recentGuesses.length > this.windowSize) {
      this.recentGuesses.shift();
    }

    const stableLetter = this.findStableLetter();

    // If the stable letter changed, restart the hold timer.
    if (stableLetter !== this.currentLetter) {
      this.currentLetter = stableLetter;
      this.stableSince = nowMs;
      this.alreadyLocked = false;
    }

    if (stableLetter === null) {
      return { stableLetter: null, holdProgress: 0, lockedLetter: null };
    }

    const heldForMs = nowMs - this.stableSince;
    const holdProgress = Math.min(1, heldForMs / this.holdMs);

    let lockedLetter = null;
    if (heldForMs >= this.holdMs && !this.alreadyLocked) {
      lockedLetter = stableLetter;
      this.alreadyLocked = true;
    }

    return { stableLetter, holdProgress, lockedLetter };
  }

  /**
   * Runs the majority vote over the recent guesses.
   * @returns {string|null} The stable letter, or null if no letter wins enough votes.
   */
  findStableLetter() {
    const vote = majorityVote(this.recentGuesses);

    // We divide by the FULL window size (not by how many guesses we have so
    // far). That way the very first frame can't count as "100% agreement".
    const agreement = vote.count / this.windowSize;
    if (vote.label === null || agreement < this.minAgreement) {
      return null;
    }
    return vote.label;
  }
}
