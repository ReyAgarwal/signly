/**
 * facts.js
 * --------
 * "Did you know?" fun facts about ASL, fingerspelling, Deaf culture, and how
 * the coach works. They're shown around the website so learners pick up a
 * little more than just the handshapes.
 *
 * FactDeck hands out the facts in a shuffled order without repeats, starting
 * over (reshuffled) once every fact has been shown.
 *
 * Pure logic (no web page code), so it can be unit tested.
 */

import { shuffle } from './games.js';

/** The facts. Each has a short topic tag and the text. */
export const FUN_FACTS = [
  { topic: 'Left-handed signers', text: 'Left-handed signers fingerspell with their LEFT hand. In ASL you sign with your dominant hand, so both hands are correct. Use the Right / Left switch at the top to flip every picture.' },
  { topic: 'Motion letters', text: 'Only two letters move: J and Z. The other 24 are held still, which is why the coach can check them from a single camera picture.' },
  { topic: 'Fingerspelling', text: 'Fingerspelling is mostly used for names, places, and words that don\'t have their own sign.' },
  { topic: 'Grammar', text: 'ASL isn\'t "English on the hands." It\'s a complete language with its own grammar and word order.' },
  { topic: 'Around the world', text: 'Sign languages aren\'t universal. British Sign Language even uses a two-handed alphabet, while ASL\'s alphabet uses one hand.' },
  { topic: 'Faces matter', text: 'Your face is part of ASL grammar: raised eyebrows can turn a statement into a yes-or-no question.' },
  { topic: 'Speed', text: 'Fluent signers fingerspell several letters per second, and readers recognize the overall shape of a word instead of reading every letter.' },
  { topic: 'Name signs', text: 'Deaf communities often give people a "name sign," so their name doesn\'t have to be fingerspelled every time.' },
  { topic: 'I love you', text: 'The popular "I love you" handshape combines three letters at once: I (pinky), L (index and thumb), and Y (thumb and pinky).' },
  { topic: 'Where to sign', text: 'Fingerspell with your hand near your shoulder and your palm facing the person you\'re talking to, so it\'s easy to read.' },
  { topic: 'Double letters', text: 'For double letters like the OO in BOOK, signers usually make a small slide or bounce instead of repeating the letter in exactly the same spot.' },
  { topic: 'Letter twins', text: 'K and P use the same handshape, and so do G and Q. The only difference is direction: P and Q point down.' },
  { topic: 'Who uses ASL', text: 'ASL is used across the United States and in much of English-speaking Canada.' },
  { topic: 'So many languages', text: 'There are hundreds of different sign languages used around the world.' },
  { topic: 'History', text: 'ASL took shape in the early 1800s, when French Sign Language mixed with sign languages already being used in America.' },
  { topic: 'Look-alikes', text: 'Some ASL letters look like the printed letter: C, L, O, V, W, and Y are easy to recognize.' },
  { topic: 'How the coach sees', text: 'MediaPipe finds 21 points on your hand: 4 on each finger and the thumb, plus 1 on the wrist.' },
  { topic: 'How the coach decides', text: 'The coach compares your hand with about 6,000 hands of real people signing, and the 5 most similar ones "vote" on your letter.' },
];

/**
 * Hands out facts in a random order, never repeating one until all have been shown.
 */
export class FactDeck {
  /**
   * Creates a deck of facts.
   * @param {Array<{topic:string, text:string}>} facts - The facts to hand out.
   * @param {function(): number} random - Random number source (0 to 1), e.g. Math.random.
   */
  constructor(facts = FUN_FACTS, random = Math.random) {
    this.facts = facts;
    this.random = random;
    this.order = [];
  }

  /**
   * Gets the next fact (reshuffling when the deck runs out).
   * @returns {{topic:string, text:string}} A fact.
   */
  next() {
    if (this.order.length === 0) {
      this.order = shuffle(this.facts, this.random);
    }
    return this.order.pop();
  }

  /**
   * Finds the fact about a topic (for example to show the left-handed fact first).
   * @param {string} topic - The topic tag.
   * @returns {{topic:string, text:string}|undefined} The fact, if there is one.
   */
  find(topic) {
    return this.facts.find((fact) => fact.topic === topic);
  }
}
