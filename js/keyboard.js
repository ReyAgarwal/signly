/**
 * keyboard.js
 * -----------
 * Keyboard shortcuts, so you can practice without reaching for the mouse
 * (your hands are busy signing!).
 *
 *   Anywhere:     1-8 = open a screen, Esc = Home
 *   Alphabet:     type a letter = practice that letter in Learn
 *   Learn:        Enter or → = next letter, ← = previous letter, type a letter = pick it
 *   Spell:        / = type a new phrase, → = skip this letter, ← = go back a letter
 *   Challenge:    Enter = start / play again, → = skip word
 *   Free Sign:    Space = add a space, Backspace = delete, Delete = clear
 *   Add Samples:  Space or Enter = record, ← → = change letter, type a letter = pick it
 *
 * shortcutFor() only DECIDES what a key means (it returns an "action" name).
 * main.js and the modes actually DO the action. Keeping them apart makes this
 * file easy to unit test.
 */

import { isStaticLetter } from './letters.js';

/** Number keys open these screens, in the same order as the top menu. */
export const SCREEN_NUMBER_KEYS = {
  1: 'alphabet',
  2: 'learn',
  3: 'spell',
  4: 'challenge',
  5: 'free',
  6: 'progress',
  7: 'data',
  8: 'record',
};

/** Shortcuts that only work on one screen: screen -> key -> action. */
const SCREEN_SHORTCUTS = {
  record: { ' ': 'record', Enter: 'record', ArrowRight: 'next-letter', ArrowLeft: 'previous-letter' },
  learn: { Enter: 'next-letter', ArrowRight: 'next-letter', ArrowLeft: 'previous-letter' },
  free: { ' ': 'space', Backspace: 'backspace', Delete: 'clear' },
  spell: { '/': 'focus-input', ArrowRight: 'next-letter', ArrowLeft: 'previous-letter' },
  challenge: { Enter: 'start', ArrowRight: 'skip' },
};

/** Screens where typing a letter key picks that letter. */
const LETTER_PICK_SCREENS = ['alphabet', 'record', 'learn'];

/**
 * Checks whether the user is typing in a box, where we must NOT steal keys.
 * @param {{tagName?:string, isContentEditable?:boolean}|null} target - The focused element.
 * @returns {boolean} True for text boxes and similar.
 */
function isTypingTarget(target) {
  if (!target || !target.tagName) {
    return false;
  }
  const tag = target.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
}

/**
 * Checks whether Enter/Space would already "click" the focused element.
 * @param {{tagName?:string}|null} target - The focused element.
 * @returns {boolean} True for buttons, links, and similar.
 */
function isClickableTarget(target) {
  if (!target || !target.tagName) {
    return false;
  }
  const tag = target.tagName.toUpperCase();
  return tag === 'BUTTON' || tag === 'A' || tag === 'LABEL' || tag === 'SUMMARY';
}

/**
 * Decides what a key press should do.
 * @param {{key:string, ctrlKey?:boolean, metaKey?:boolean, altKey?:boolean, target?:Object}} keyEvent
 *   The keyboard event (or a plain object shaped like one, in tests).
 * @param {string} screen - The screen that's open, e.g. "learn".
 * @returns {string|null} An action like "next-letter", "go:learn", "pick:B", or null for "ignore".
 */
export function shortcutFor(keyEvent, screen) {
  // Leave browser shortcuts (Ctrl+R, Cmd+C, ...) and typing in boxes alone.
  if (keyEvent.ctrlKey || keyEvent.metaKey || keyEvent.altKey || isTypingTarget(keyEvent.target)) {
    return null;
  }
  const key = keyEvent.key;

  // If a button has focus, Enter and Space already press it. Doing our own
  // action too would make one key press count twice.
  if ((key === 'Enter' || key === ' ') && isClickableTarget(keyEvent.target)) {
    return null;
  }

  if (key === 'Escape') {
    return 'go:home';
  }
  if (SCREEN_NUMBER_KEYS[key]) {
    return 'go:' + SCREEN_NUMBER_KEYS[key];
  }

  const screenKeys = SCREEN_SHORTCUTS[screen] ?? {};
  if (screenKeys[key]) {
    return screenKeys[key];
  }

  const upper = key.length === 1 ? key.toUpperCase() : '';
  if (LETTER_PICK_SCREENS.includes(screen) && isStaticLetter(upper)) {
    return 'pick:' + upper;
  }
  return null;
}
