/**
 * keyboard-settings.test.js
 * -------------------------
 * Tests for keyboard shortcuts (js/keyboard.js) and saved settings (js/storage.js).
 * Run with: node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortcutFor } from '../js/keyboard.js';
import { loadSettings, saveSettings, DEFAULT_SETTINGS, SETTINGS_KEY } from '../js/storage.js';

/**
 * Makes a pretend key press.
 * @param {string} key - The key, e.g. "Enter".
 * @param {Object} extra - Extra fields (modifier keys, target element).
 * @returns {Object} Something shaped like a KeyboardEvent.
 */
function press(key, extra = {}) {
  return { key, target: { tagName: 'BODY' }, ...extra };
}

test('Enter and the right arrow go to the next letter in Learn', () => {
  assert.equal(shortcutFor(press('Enter'), 'learn'), 'next-letter');
  assert.equal(shortcutFor(press('ArrowRight'), 'learn'), 'next-letter');
  assert.equal(shortcutFor(press('ArrowLeft'), 'learn'), 'previous-letter');
});

test('typing a letter picks it (lowercase works too), but not J or Z', () => {
  assert.equal(shortcutFor(press('b'), 'learn'), 'pick:B');
  assert.equal(shortcutFor(press('Y'), 'record'), 'pick:Y');
  assert.equal(shortcutFor(press('j'), 'learn'), null);
  assert.equal(shortcutFor(press('z'), 'alphabet'), null);
});

test('number keys and Esc switch screens from anywhere', () => {
  assert.equal(shortcutFor(press('1'), 'home'), 'go:alphabet');
  assert.equal(shortcutFor(press('4'), 'spell'), 'go:learn');
  assert.equal(shortcutFor(press('Escape'), 'learn'), 'go:home');
});

test('each mode gets its own keys', () => {
  assert.equal(shortcutFor(press(' '), 'record'), 'record');
  assert.equal(shortcutFor(press(' '), 'free'), 'space');
  assert.equal(shortcutFor(press('Backspace'), 'free'), 'backspace');
  assert.equal(shortcutFor(press('Enter'), 'spell'), 'start');
  assert.equal(shortcutFor(press('ArrowRight'), 'spell'), 'skip');
  // Letter keys don't do anything on the Spell screen.
  assert.equal(shortcutFor(press('a'), 'spell'), null);
});

test('browser shortcuts and focused buttons are left alone', () => {
  assert.equal(shortcutFor(press('r', { metaKey: true }), 'learn'), null);
  assert.equal(shortcutFor(press('c', { ctrlKey: true }), 'learn'), null);
  // Enter on a focused button already clicks it, so we must not ALSO act on it.
  assert.equal(shortcutFor(press('Enter', { target: { tagName: 'BUTTON' } }), 'learn'), null);
  // But arrow keys still work when a button has focus.
  assert.equal(shortcutFor(press('ArrowRight', { target: { tagName: 'BUTTON' } }), 'learn'), 'next-letter');
  // Typing in a text box is never a shortcut.
  assert.equal(shortcutFor(press('a', { target: { tagName: 'INPUT' } }), 'learn'), null);
});

test('settings use defaults, save, load, and ignore junk', () => {
  const data = new Map();
  const storage = {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
  assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);

  assert.equal(saveSettings({ ...DEFAULT_SETTINGS, flipDiagrams: true }, storage), true);
  assert.equal(loadSettings(storage).flipDiagrams, true);

  data.set(SETTINGS_KEY, JSON.stringify({ autoAdvance: 'yes please', hacker: true }));
  const cleaned = loadSettings(storage);
  assert.equal(cleaned.autoAdvance, DEFAULT_SETTINGS.autoAdvance);
  assert.equal('hacker' in cleaned, false);

  data.set(SETTINGS_KEY, '{ broken json');
  assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);
  assert.deepEqual(loadSettings(null), DEFAULT_SETTINGS);
});
