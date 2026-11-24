/**
 * classifier.js
 * -------------
 * Recognizes which letter a hand is making using k-Nearest Neighbors (k-NN).
 * We wrote it ourselves; no machine learning library is used.
 *
 * The idea in one sentence: "You are probably the same letter as the
 * recorded samples you look the MOST like."
 *
 *   1. Measure the distance from the live hand to EVERY recorded sample.
 *      (Distance = how different two hand shapes are. 0 = identical.)
 *   2. Keep the k closest samples (k = 5 by default). These are the
 *      "nearest neighbors".
 *   3. Each neighbor votes for its own letter. Most votes wins.
 *   4. Confidence = winning votes / k. 4 out of 5 votes = 80%.
 *
 * This file also has the Accuracy Test: hide some samples, try to
 * recognize them using only the other samples, and count the mistakes.
 *
 * A "sample" looks like: { letter: 'B', features: [63 numbers], ... }
 * This file is pure math, so it can be unit tested in Node.
 */

/** How many neighbors get a vote. Odd numbers make ties less likely. */
export const DEFAULT_K = 5;

/** What fraction of each letter's samples the accuracy test hides. */
export const DEFAULT_TEST_FRACTION = 0.2;

/**
 * Measures how different two feature vectors are (Euclidean distance).
 * @param {number[]} a - First feature vector (63 numbers).
 * @param {number[]} b - Second feature vector (same length).
 * @returns {number} The distance. 0 means identical; bigger means more different.
 */
export function euclideanDistance(a, b) {
  // Same idea as the distance formula from geometry class, sqrt(dx^2 + dy^2),
  // but with 63 directions instead of 2. We add up the squared difference
  // of every number, then take the square root.
  let sumOfSquares = 0;
  for (let i = 0; i < a.length; i++) {
    const difference = a[i] - b[i];
    sumOfSquares += difference * difference;
  }
  return Math.sqrt(sumOfSquares);
}

/**
 * Finds the k recorded samples that are closest to a live hand.
 * @param {number[]} features - The live hand's feature vector.
 * @param {Array<{letter:string, features:number[]}>} samples - All recorded samples.
 * @param {number} k - How many neighbors to return.
 * @returns {Array<{letter:string, distance:number}>} Closest first.
 */
export function findNearestNeighbors(features, samples, k) {
  const scored = [];
  for (const sample of samples) {
    const distance = euclideanDistance(features, sample.features);
    scored.push({ letter: sample.letter, distance: distance });
  }

  // Sort from smallest distance (most similar) to largest.
  scored.sort((first, second) => first.distance - second.distance);
  return scored.slice(0, k);
}

/**
 * Counts how many neighbors voted for each letter.
 * @param {Array<{letter:string, distance:number}>} neighbors - From findNearestNeighbors.
 * @returns {Array<{letter:string, votes:number, closestDistance:number}>}
 *   One entry per letter, most votes first.
 */
export function countVotes(neighbors) {
  const tally = new Map();
  for (const neighbor of neighbors) {
    if (!tally.has(neighbor.letter)) {
      tally.set(neighbor.letter, { letter: neighbor.letter, votes: 0, closestDistance: Infinity });
    }
    const entry = tally.get(neighbor.letter);
    entry.votes += 1;
    entry.closestDistance = Math.min(entry.closestDistance, neighbor.distance);
  }

  const results = Array.from(tally.values());

  // Most votes first. If two letters tie, the one with the single closest
  // sample wins the tie, because closer usually means more similar.
  results.sort((first, second) => {
    if (second.votes !== first.votes) {
      return second.votes - first.votes;
    }
    return first.closestDistance - second.closestDistance;
  });
  return results;
}

/**
 * Recognizes the letter for one live hand.
 * @param {number[]} features - The live hand's 63-number feature vector.
 * @param {Array<{letter:string, features:number[]}>} samples - Recorded samples.
 * @param {number} k - How many neighbors vote (default 5).
 * @returns {{letter:string, confidence:number, votes:Array, nearestDistance:number}|null}
 *   The best guess with confidence from 0 to 1, or null if there are no samples.
 */
export function classify(features, samples, k = DEFAULT_K) {
  if (samples.length === 0) {
    return null;
  }

  // If we only have 3 samples, we can't ask 5 neighbors. Use what we have.
  const neighborCount = Math.min(k, samples.length);
  const neighbors = findNearestNeighbors(features, samples, neighborCount);
  const votes = countVotes(neighbors);
  const winner = votes[0];

  return {
    letter: winner.letter,
    confidence: winner.votes / neighborCount,
    votes: votes,
    nearestDistance: neighbors[0].distance,
  };
}

/**
 * Groups samples by letter, keeping them in the order they were recorded.
 * @param {Array<{letter:string}>} samples - Recorded samples.
 * @returns {Map<string, Array>} letter -> list of that letter's samples.
 */
export function groupByLetter(samples) {
  const groups = new Map();
  for (const sample of samples) {
    if (!groups.has(sample.letter)) {
      groups.set(sample.letter, []);
    }
    groups.get(sample.letter).push(sample);
  }
  return groups;
}

/**
 * Splits samples into a training set and a test set for the accuracy test.
 * For every letter, the NEWEST samples (the last 20%) go into the test set.
 * @param {Array<{letter:string, time?:number}>} samples - Recorded samples.
 * @param {number} testFraction - Fraction to hide for testing (0.2 = 20%).
 * @returns {{train:Array, test:Array}} The two groups of samples.
 */
export function splitHoldout(samples, testFraction = DEFAULT_TEST_FRACTION) {
  const train = [];
  const test = [];

  for (const letterSamples of groupByLetter(samples).values()) {
    // A letter with only 1 sample can't be split: if we hid it, there would
    // be nothing left to learn from. So it stays in training only.
    let testCount = Math.round(letterSamples.length * testFraction);
    if (letterSamples.length >= 2 && testCount === 0) {
      testCount = 1;
    }
    if (letterSamples.length < 2) {
      testCount = 0;
    }

    // Samples are stored in recording order, so the last ones are newest.
    // Testing on the newest ones is a little more honest than picking at
    // random, because samples recorded one right after another look nearly
    // identical (it would be like peeking at the answer).
    const splitIndex = letterSamples.length - testCount;
    train.push(...letterSamples.slice(0, splitIndex));
    test.push(...letterSamples.slice(splitIndex));
  }

  return { train, test };
}

/**
 * Adds one result to a confusion table.
 * @param {Object<string, Object<string, number>>} confusion - actual -> predicted -> count.
 * @param {string} actual - The letter the sample really is.
 * @param {string} predicted - The letter k-NN guessed.
 * @returns {void}
 */
function addToConfusion(confusion, actual, predicted) {
  if (!confusion[actual]) {
    confusion[actual] = {};
  }
  const previous = confusion[actual][predicted] ?? 0;
  confusion[actual][predicted] = previous + 1;
}

/**
 * Lists the mistakes from a confusion table, most common first.
 * @param {Object<string, Object<string, number>>} confusion - actual -> predicted -> count.
 * @returns {Array<{actual:string, predicted:string, count:number}>} Only wrong guesses.
 */
export function listConfusions(confusion) {
  const mistakes = [];
  for (const actual of Object.keys(confusion)) {
    for (const predicted of Object.keys(confusion[actual])) {
      if (actual !== predicted) {
        mistakes.push({ actual, predicted, count: confusion[actual][predicted] });
      }
    }
  }
  mistakes.sort((first, second) => second.count - first.count);
  return mistakes;
}

/**
 * The Accuracy Test: hides some samples, recognizes them using only the rest,
 * and reports how many were right and which letters got mixed up.
 * @param {Array<{letter:string, features:number[]}>} samples - All recorded samples.
 * @param {{k?:number, testFraction?:number}} options - k-NN settings.
 * @returns {{total:number, correct:number, accuracy:number,
 *   perLetter:Object<string,{total:number, correct:number}>,
 *   confusion:Object<string,Object<string,number>>,
 *   topConfusions:Array<{actual:string, predicted:string, count:number}>}}
 */
export function evaluateAccuracy(samples, options = {}) {
  const k = options.k ?? DEFAULT_K;
  const testFraction = options.testFraction ?? DEFAULT_TEST_FRACTION;
  const { train, test } = splitHoldout(samples, testFraction);

  const perLetter = {};
  const confusion = {};
  let correct = 0;

  for (const sample of test) {
    const guess = classify(sample.features, train, k);
    const predicted = guess ? guess.letter : '?';

    if (!perLetter[sample.letter]) {
      perLetter[sample.letter] = { total: 0, correct: 0 };
    }
    perLetter[sample.letter].total += 1;

    if (predicted === sample.letter) {
      correct += 1;
      perLetter[sample.letter].correct += 1;
    }
    addToConfusion(confusion, sample.letter, predicted);
  }

  return {
    total: test.length,
    correct: correct,
    accuracy: test.length > 0 ? correct / test.length : 0,
    perLetter: perLetter,
    confusion: confusion,
    topConfusions: listConfusions(confusion),
  };
}

/**
 * Picks up to `limit` samples of each letter, evenly spread out.
 * @param {Array<{letter:string}>} samples - Samples to choose from.
 * @param {number} limit - Max per letter (Infinity = keep all).
 * @returns {Array<Object>} The chosen samples.
 */
function pickPerLetter(samples, limit) {
  const chosen = [];
  for (const letterSamples of groupByLetter(samples).values()) {
    const count = Math.min(limit, letterSamples.length);
    for (let i = 0; i < count; i++) {
      chosen.push(letterSamples[Math.floor((i * letterSamples.length) / count)]);
    }
  }
  return chosen;
}

/**
 * The FAIR accuracy test ("leave one person out"). For each person (group)
 * in the data: hide ALL of that person's samples, use everyone else as the
 * k-NN samples, and count how many of the hidden person's signs are
 * recognized. This shows how well the coach works for someone it has never
 * seen, which is exactly the situation of a new user.
 * @param {Array<{letter:string, group:string, features:number[]}>} samples - Samples with a person/group label.
 * @param {{k?:number, testPerLetterPerGroup?:number}} options
 *   testPerLetterPerGroup = test only this many signs per letter per person (faster).
 * @returns {{total:number, correct:number, accuracy:number,
 *   perLetter:Object<string,{total:number, correct:number}>,
 *   perGroup:Object<string,{total:number, correct:number}>,
 *   confusion:Object<string,Object<string,number>>,
 *   topConfusions:Array<{actual:string, predicted:string, count:number}>}}
 */
export function evaluateUnseenPeople(samples, options = {}) {
  const k = options.k ?? DEFAULT_K;
  const limit = options.testPerLetterPerGroup ?? Infinity;
  const groups = [...new Set(samples.map((sample) => sample.group))];

  const perLetter = {};
  const perGroup = {};
  const confusion = {};
  let correct = 0;
  let total = 0;

  for (const group of groups) {
    const train = samples.filter((sample) => sample.group !== group);
    const test = pickPerLetter(samples.filter((sample) => sample.group === group), limit);
    perGroup[group] = { total: 0, correct: 0 };

    for (const sample of test) {
      const guess = classify(sample.features, train, k);
      const predicted = guess ? guess.letter : '?';
      const isRight = predicted === sample.letter;

      perLetter[sample.letter] = perLetter[sample.letter] ?? { total: 0, correct: 0 };
      perLetter[sample.letter].total += 1;
      perGroup[group].total += 1;
      total += 1;
      if (isRight) {
        perLetter[sample.letter].correct += 1;
        perGroup[group].correct += 1;
        correct += 1;
      }
      addToConfusion(confusion, sample.letter, predicted);
    }
  }

  return {
    total,
    correct,
    accuracy: total > 0 ? correct / total : 0,
    perLetter,
    perGroup,
    confusion,
    topConfusions: listConfusions(confusion),
  };
}
