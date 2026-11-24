/**
 * learning.js
 * -----------
 * "Keep learning": the coach slowly gets used to YOUR hand and camera,
 * without ever learning a wrong handshape.
 *
 * The danger with a coach that learns from its user is obvious: if you
 * sign a letter wrong and it learns from that, it starts teaching the
 * mistake. So we only learn from a sign when ALL of these are true:
 *
 *   1. You were asked for a letter (in Learn or Spell-a-Word), and
 *   2. the coach locked in that same letter, and
 *   3. the REAL SIGNERS ALONE (the reference set, without anything learned
 *      from you) agree strongly: at least 4 of the 5 nearest neighbors.
 *
 * Rule 3 is the safety lock. A learned sample can only be added if it
 * already looks like the real signers' version. It just helps the coach
 * recognize your correct signing more reliably, for example with your
 * lighting, camera angle, or hand size.
 *
 * Learned samples are also capped (30 per letter, oldest replaced first), so
 * the real signers always outnumber them. They can be erased any time on
 * the Test & Data screen.
 *
 * Pure logic (no web page code), so it can be unit tested.
 */

/** The real signers must agree at least this much (4 of 5 neighbors). */
export const LEARN_MIN_CONFIDENCE = 0.8;

/** Keep at most this many learned samples per letter. */
export const LEARNED_PER_LETTER = 30;

/**
 * Decides whether a correct sign is safe to learn from.
 * @param {string} targetLetter - The letter the user was asked to sign.
 * @param {string} lockedLetter - The letter the coach locked in.
 * @param {{letter:string, confidence:number}|null} trustedGuess
 *   k-NN result using ONLY trusted samples (real signers + teacher-added).
 * @returns {boolean} True if the sign should be learned.
 */
export function shouldLearn(targetLetter, lockedLetter, trustedGuess) {
  if (lockedLetter !== targetLetter || !trustedGuess) {
    return false;
  }
  return trustedGuess.letter === targetLetter && trustedGuess.confidence >= LEARN_MIN_CONFIDENCE;
}

/**
 * Adds a learned sample, removing the oldest learned sample of the same
 * letter if that letter is already at the cap.
 * @param {Array<Object>} samples - All user samples (teacher-added and learned).
 * @param {{letter:string, source:string}} newSample - The sample to add (source 'learned').
 * @param {number} cap - Max learned samples per letter.
 * @returns {Array<Object>} A new list of samples.
 */
export function addLearnedSample(samples, newSample, cap = LEARNED_PER_LETTER) {
  const updated = [...samples, newSample];
  const sameLetterLearned = updated.filter((s) => s.source === 'learned' && s.letter === newSample.letter);
  if (sameLetterLearned.length <= cap) {
    return updated;
  }
  // Samples are kept in the order they were added, so the first one is the oldest.
  const oldest = sameLetterLearned[0];
  return updated.filter((s) => s !== oldest);
}

/**
 * Counts user samples by where they came from.
 * @param {Array<{source?:string}>} samples - User samples.
 * @returns {{teacher:number, learned:number}} How many of each.
 */
export function countBySource(samples) {
  let teacher = 0;
  let learned = 0;
  for (const sample of samples) {
    if (sample.source === 'learned') {
      learned += 1;
    } else {
      teacher += 1;
    }
  }
  return { teacher, learned };
}
