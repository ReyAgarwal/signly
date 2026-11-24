/**
 * ui.js
 * -----
 * Helpers for updating the web page: switching screens, showing messages,
 * building the letter picker, meters, tables, and the success animation.
 *
 * Nothing here does any recognition math. Keeping page code separate from
 * math code means the math files can be tested without a browser.
 *
 * Safety note: we always set text with .textContent (never .innerHTML),
 * so text from an imported file can never be run as code.
 */

import { STATIC_LETTERS, ALPHABET, LETTER_TIPS, LETTER_MIXUPS, isMotionLetter } from './letters.js';
import { statsByLetter, statsByDay, letterHistory, overallStats } from './progress.js';
import { createHandDiagram } from './diagram.js';
import { LETTER_PHOTOS } from './letterPhotos.js';

/** Screens that use the webcam. */
export const CAMERA_SCREENS = ['learn', 'spell', 'challenge', 'free', 'record'];

/** The heading shown above the camera for each camera screen. */
const CAMERA_HEADINGS = {
  learn: { eyebrow: 'Practice', title: 'Learn', sub: 'Copy the picture, hold the sign steady, and fix the finger that turns red.' },
  spell: { eyebrow: 'Practice', title: 'Spell', sub: 'Type a word or sentence, and the coach teaches you how to fingerspell it, letter by letter.' },
  challenge: { eyebrow: 'Game', title: 'Challenge', sub: 'Spell as many words as you can before time runs out.' },
  free: { eyebrow: 'Explore', title: 'Free Sign', sub: 'Sign anything and watch how the coach recognizes it, including the k-NN votes.' },
  record: { eyebrow: 'Teacher tool', title: 'Add Samples', sub: 'For fluent signers: add extra correct examples for the coach to compare against.' },
};

/** Timer that hides the success animation (so a new one can cancel the old one). */
let successTimer = null;

/**
 * Finds an element by its id, and complains clearly if it's missing.
 * @param {string} id - The element's id attribute.
 * @returns {HTMLElement} The element.
 */
export function byId(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error('Missing element with id "' + id + '" in index.html');
  }
  return element;
}

/**
 * Creates an element with optional CSS class and text.
 * @param {string} tag - Tag name, e.g. "div".
 * @param {string} className - CSS class(es), or "".
 * @param {string} text - Text inside the element, or "".
 * @returns {HTMLElement} The new element.
 */
export function makeElement(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text) {
    element.textContent = text;
  }
  return element;
}

/**
 * Turns a fraction into a percent label.
 * @param {number} fraction - 0 to 1.
 * @returns {string} For example "83%".
 */
export function formatPercent(fraction) {
  return Math.round(fraction * 100) + '%';
}

/**
 * Shows one screen and hides the others. Camera modes share one layout.
 * @param {string} screenName - "home", "alphabet", "record", "free", "learn", "spell", "progress", or "data".
 * @returns {void}
 */
export function showScreen(screenName) {
  const isCameraScreen = CAMERA_SCREENS.includes(screenName);
  byId('screen-home').hidden = screenName !== 'home';
  byId('screen-alphabet').hidden = screenName !== 'alphabet';
  byId('screen-progress').hidden = screenName !== 'progress';
  byId('screen-data').hidden = screenName !== 'data';
  byId('screen-camera').hidden = !isCameraScreen;

  for (const mode of CAMERA_SCREENS) {
    byId('panel-' + mode).hidden = mode !== screenName;
  }
  if (isCameraScreen) {
    const heading = CAMERA_HEADINGS[screenName];
    byId('camera-eyebrow').textContent = heading.eyebrow;
    byId('camera-title').textContent = heading.title;
    byId('camera-sub').textContent = heading.sub;
  }

  // Mark the active nav button so screen readers (and CSS) know which page is open.
  for (const button of document.querySelectorAll('.nav button')) {
    if (button.dataset.screen === screenName) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  }
  window.scrollTo(0, 0);
}

/**
 * Shows a message banner at the top of the page.
 * @param {string} message - What to say.
 * @param {'info'|'error'|'success'} kind - Changes the color.
 * @returns {void}
 */
export function showBanner(message, kind = 'info') {
  const banner = byId('banner');
  byId('banner-text').textContent = message;
  banner.className = 'banner ' + kind;
  banner.hidden = false;
}

/**
 * Hides the message banner.
 * @returns {void}
 */
export function hideBanner() {
  byId('banner').hidden = true;
}

/**
 * Shows a message on top of the camera video (or hides it if text is "").
 * @param {string} text - The message.
 * @param {boolean} isError - True to show it in red.
 * @returns {void}
 */
export function setCameraStatus(text, isError = false) {
  const status = byId('camera-status');
  status.textContent = text;
  status.classList.toggle('error', isError);
}

/**
 * Sets how full a meter bar is.
 * @param {HTMLElement} fillElement - The inner ".meter-fill" element.
 * @param {number} fraction - 0 (empty) to 1 (full).
 * @returns {void}
 */
export function setMeter(fillElement, fraction) {
  const clamped = Math.max(0, Math.min(1, fraction));
  fillElement.style.width = (clamped * 100).toFixed(1) + '%';
}

/**
 * Builds a grid of letter buttons (A, B, C, ... Y).
 * @param {HTMLElement} container - Where to put the buttons.
 * @param {{counts:Object<string,number>, selected:string|null, onPick:function(string):void,
 *   showCounts?:boolean, mastered?:Set<string>, pressed?:Set<string>}} options
 *   counts = samples per letter, selected = highlighted letter,
 *   onPick = called with the letter when clicked, showCounts = show the sample count,
 *   mastered = letters signed correctly before (they get a check mark),
 *   pressed = several highlighted letters at once (for choosing a practice set).
 * @returns {void}
 */
export function renderLetterGrid(container, options) {
  container.replaceChildren();
  const mastered = options.mastered ?? new Set();
  for (const letter of STATIC_LETTERS) {
    const count = options.counts[letter] ?? 0;
    const button = makeElement('button', 'letter-button');
    button.type = 'button';
    const isPressed = options.pressed ? options.pressed.has(letter) : letter === options.selected;
    button.setAttribute('aria-pressed', String(isPressed));
    button.append(makeElement('span', '', letter));
    let label = letter + ', ' + count + ' samples';

    if (options.showCounts !== false) {
      button.append(makeElement('span', 'letter-count', String(count)));
    }
    // Green border = the coach can check this letter. Dashed = study the picture only.
    if (count > 0) {
      button.classList.add('has-samples');
    } else {
      button.classList.add('no-samples');
    }
    if (mastered.has(letter)) {
      button.classList.add('mastered');
      label += ', signed correctly before';
    }
    button.setAttribute('aria-label', label);

    button.addEventListener('click', () => options.onPick(letter));
    container.append(button);
  }
}

/**
 * Draws the Home page artwork: the letters A, S, L as hand diagrams.
 * (Drawn by our own diagram code, so no pictures need to be downloaded.)
 * @param {HTMLElement} container - The hero art area.
 * @returns {void}
 */
export function renderHeroArt(container, flipX = false) {
  container.replaceChildren();
  for (const letter of ['A', 'S', 'L']) {
    const card = makeElement('div', 'hero-card');
    card.append(createHandDiagram(letter, { flipX }), makeElement('span', '', letter));
    container.append(card);
  }
}

/**
 * Puts a fun fact into a "Did you know?" card.
 * @param {HTMLElement} slot - The card (an element with data-fact-slot).
 * @param {{topic:string, text:string}} fact - The fact to show.
 * @returns {void}
 */
export function showFact(slot, fact) {
  slot.querySelector('.fact-topic').textContent = 'Did you know? · ' + fact.topic;
  slot.querySelector('.fact-text').textContent = fact.text;
}

/**
 * Fills the Alphabet screen with a card for every letter.
 * @param {HTMLElement} container - The grid element.
 * @param {{mastered:Set<string>, flipX:boolean, onPick:function(string):void}} options
 *   mastered = letters signed correctly before, flipX = mirror the pictures,
 *   onPick = called when a card is clicked.
 * @returns {void}
 */
export function renderAlphabetChart(container, options) {
  container.replaceChildren();
  for (const letter of ALPHABET) {
    const moves = isMotionLetter(letter);
    const card = makeElement('button', moves ? 'alphabet-card motion' : 'alphabet-card');
    card.type = 'button';
    card.setAttribute('aria-label', moves ? 'How to sign ' + letter + ' (a motion letter)' : 'Practice the letter ' + letter);

    const top = makeElement('div', 'card-top');
    top.append(makeElement('span', 'card-letter', letter));
    top.append(createHandDiagram(letter, { flipX: options.flipX }));
    const photo = makeElement('div', 'card-photo');
    renderLetterPhotos(photo, letter, options.flipX, 1);
    top.append(photo);
    card.append(top);

    // J and Z move, so the coach can't check them yet: say so on the card.
    if (moves) {
      card.append(makeElement('span', 'motion-badge', '↻ Moves · not checked by the coach yet'));
    }
    card.append(makeElement('span', 'card-tip', LETTER_TIPS[letter]));
    card.append(makeElement('span', 'mixup', LETTER_MIXUPS[letter]));

    if (options.mastered.has(letter)) {
      card.append(makeElement('span', 'card-status', '✓ You have signed this correctly'));
    }

    card.addEventListener('click', () => options.onPick(letter));
    container.append(card);
  }
}

/**
 * Shows the real-signer photos of a letter (from letterPhotos.js).
 * @param {HTMLElement} container - Where to put the photos.
 * @param {string} letter - The letter.
 * @param {boolean} flipX - True to mirror the photos (left-handed mode), like the diagrams.
 * @param {number} limit - How many photos to show at most.
 * @returns {void}
 */
export function renderLetterPhotos(container, letter, flipX = false, limit = 2) {
  container.replaceChildren();
  for (const photo of (LETTER_PHOTOS[letter] ?? []).slice(0, limit)) {
    const image = makeElement('img', flipX ? 'letter-photo flipped' : 'letter-photo');
    image.src = photo.src;
    image.alt = 'Photo of a real signer making the letter ' + letter;
    image.loading = 'lazy';
    container.append(image);
  }
}

/**
 * Shows the k-NN votes as dots, e.g. "B ●●●●" "D ●".
 * @param {HTMLElement} container - Where to show the votes.
 * @param {Array<{letter:string, votes:number}>} votes - From the classifier (most votes first).
 * @returns {void}
 */
export function renderVotes(container, votes) {
  container.replaceChildren();
  for (const vote of votes) {
    const chip = makeElement('span', 'vote');
    chip.append(vote.letter + ' ');
    chip.append(makeElement('span', 'vote-dots', '●'.repeat(vote.votes)));
    chip.setAttribute('aria-label', vote.letter + ': ' + vote.votes + ' votes');
    container.append(chip);
  }
}

/**
 * Plays the big green check animation over the video.
 * @param {string} text - Message under the check, e.g. "You signed B!".
 * @returns {void}
 */
export function showSuccessBurst(text) {
  const burst = byId('success-burst');
  byId('success-text').textContent = text;
  // Hiding and showing again (with a reflow in between) restarts the CSS animation.
  burst.hidden = true;
  void burst.offsetWidth;
  burst.hidden = false;
  clearTimeout(successTimer);
  successTimer = setTimeout(() => {
    burst.hidden = true;
  }, 1600);
}

/**
 * Shows big text over the video (countdown numbers), or hides it.
 * @param {string} text - What to show, or "" to hide.
 * @param {boolean} isRecordingLabel - True for the small "Recording..." label style.
 * @returns {void}
 */
export function setCountdown(text, isRecordingLabel = false) {
  const countdown = byId('countdown');
  countdown.textContent = text;
  countdown.classList.toggle('recording', isRecordingLabel);
  countdown.hidden = text === '';
}

/**
 * Makes a "dangerous" button need two clicks, so data isn't deleted by accident.
 * The first click changes the label to "Click again to confirm" for 4 seconds.
 * (We avoid the browser's confirm() popup because it freezes the camera loop.)
 * @param {HTMLButtonElement} button - The button.
 * @param {function():void} action - What to do on the second click.
 * @returns {void}
 */
export function makeConfirmButton(button, action) {
  const originalText = button.textContent;
  let timer = null;

  button.addEventListener('click', () => {
    if (button.classList.contains('confirming')) {
      clearTimeout(timer);
      button.classList.remove('confirming');
      button.textContent = originalText;
      action();
      return;
    }
    button.classList.add('confirming');
    button.textContent = 'Click again to confirm';
    timer = setTimeout(() => {
      button.classList.remove('confirming');
      button.textContent = originalText;
    }, 4000);
  });
}

/**
 * Makes the browser download some text as a file.
 * @param {string} fileName - Name for the downloaded file.
 * @param {string} text - The file's contents.
 * @returns {void}
 */
export function downloadTextFile(fileName, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = makeElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before freeing the memory.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Builds a table element from a header row and data rows.
 * @param {string[]} headers - Column titles.
 * @param {Array<Array<string|Node>>} rows - Each cell is text or an element.
 * @returns {HTMLTableElement} The table.
 */
export function makeTable(headers, rows) {
  const table = makeElement('table', 'data-table');
  const headRow = makeElement('tr');
  for (const header of headers) {
    const cell = makeElement('th', '', header);
    cell.scope = 'col';
    headRow.append(cell);
  }
  table.append(makeElement('thead'));
  table.tHead.append(headRow);

  const body = makeElement('tbody');
  for (const row of rows) {
    const tableRow = makeElement('tr');
    for (const cellContent of row) {
      const cell = makeElement('td');
      cell.append(cellContent);
      tableRow.append(cell);
    }
    body.append(tableRow);
  }
  table.append(body);
  return table;
}

/**
 * Makes a horizontal accuracy bar with a percent label.
 * @param {number} fraction - 0 to 1.
 * @returns {HTMLElement} The bar element.
 */
export function makeAccuracyBar(fraction) {
  const wrapper = makeElement('div', 'bar');
  const track = makeElement('div', 'bar-track');
  let quality = '';
  if (fraction >= 0.8) {
    quality = 'good';
  } else if (fraction < 0.5) {
    quality = 'bad';
  }
  const fill = makeElement('div', 'bar-fill ' + quality);
  fill.style.width = formatPercent(fraction);
  track.append(fill);
  wrapper.append(track, makeElement('span', '', formatPercent(fraction)));
  return wrapper;
}

/**
 * Makes a small summary card (a label with a big number).
 * @param {string} label - What the number means.
 * @param {string} value - The number to show.
 * @returns {HTMLElement} The card.
 */
function makeSummaryCard(label, value) {
  const card = makeElement('div', 'summary-card');
  card.append(makeElement('p', 'label', label), makeElement('p', 'score-number', value));
  return card;
}

/**
 * Shows the "practice next" letters as buttons.
 * @param {string[]} letters - Suggested letters (weakest first).
 * @param {Object<string, {accuracy:number}>} byLetter - Stats from statsByLetter().
 * @param {function(string):void} onPick - Called with a letter when clicked.
 * @returns {void}
 */
function renderPracticeNext(letters, byLetter, onPick) {
  const container = byId('practice-next');
  container.replaceChildren();
  if (letters.length === 0) {
    container.append(makeElement('p', 'count-text', 'Great job: every letter you\'ve tried is at 80% or better!'));
    return;
  }
  for (const letter of letters) {
    const button = makeElement('button', 'practice-letter', letter);
    button.type = 'button';
    const stats = byLetter[letter];
    button.append(makeElement('small', '', stats ? formatPercent(stats.accuracy) : 'new'));
    button.addEventListener('click', () => onPick(letter));
    container.append(button);
  }
}

/**
 * Fills in the Progress screen.
 * @param {Array<Object>} attempts - Saved attempts.
 * @param {{easy:number, medium:number, hard:number}} bestScores - Best Challenge score per difficulty.
 * @param {{streak:number, practiceNext:string[], onPractice:function(string):void}} extras
 *   streak = days in a row, practiceNext = suggested letters, onPractice = opens a letter in Learn.
 * @returns {void}
 */
export function renderProgress(attempts, bestScores, extras) {
  const overall = overallStats(attempts);
  const summary = byId('progress-summary');
  const streakCard = makeSummaryCard('Day streak 🔥', String(extras.streak));
  streakCard.classList.add('streak');
  renderPracticeNext(extras.practiceNext, statsByLetter(attempts), extras.onPractice);
  summary.replaceChildren(
    streakCard,
    makeSummaryCard('Attempts', String(overall.total)),
    makeSummaryCard('Overall accuracy', overall.total > 0 ? formatPercent(overall.accuracy) : '-'),
    makeSummaryCard('Letters practiced', overall.lettersPracticed + ' / 24'),
    makeSummaryCard('Best: Easy', String(bestScores.easy)),
    makeSummaryCard('Best: Medium', String(bestScores.medium)),
    makeSummaryCard('Best: Hard', String(bestScores.hard)),
  );

  const lettersBox = byId('progress-letters');
  const daysBox = byId('progress-days');
  if (attempts.length === 0) {
    const note = 'No practice yet. Lock in letters in Learn, Spell, or Challenge and your results will show up here.';
    lettersBox.replaceChildren(makeElement('p', 'empty-note', note));
    daysBox.replaceChildren();
    return;
  }

  // One row per practiced letter: attempts, accuracy bar, and recent days.
  const byLetter = statsByLetter(attempts);
  const letterRows = [];
  for (const letter of STATIC_LETTERS) {
    const stats = byLetter[letter];
    if (!stats) {
      continue;
    }
    const recentDays = makeElement('div', 'day-cells');
    for (const day of letterHistory(attempts, letter, 5)) {
      const cell = makeElement('span', 'day-cell', day.day.slice(5) + ': ' + formatPercent(day.accuracy));
      recentDays.append(cell);
    }
    letterRows.push([letter, stats.correct + ' / ' + stats.total, makeAccuracyBar(stats.accuracy), recentDays]);
  }
  lettersBox.replaceChildren(makeTable(['Letter', 'Correct', 'Accuracy', 'Recent days (month-day: accuracy)'], letterRows));

  // One row per day, newest first, so improvement over time is easy to see.
  const dayRows = [];
  for (const day of statsByDay(attempts).reverse()) {
    dayRows.push([day.day, day.correct + ' / ' + day.total, makeAccuracyBar(day.accuracy)]);
  }
  daysBox.replaceChildren(makeTable(['Day', 'Correct', 'Accuracy'], dayRows));
}

/**
 * Fills in the Accuracy Test results.
 * @param {HTMLElement} container - Where to show the results.
 * @param {Object} report - From evaluateAccuracy() in classifier.js.
 * @returns {void}
 */
export function renderAccuracyReport(container, report) {
  container.replaceChildren();
  container.append(makeElement('p', 'feedback',
    'Overall accuracy on people the coach had never seen: ' + formatPercent(report.accuracy)
    + ' (' + report.correct + ' of ' + report.total + ' signs recognized correctly)'));

  // One row per person (or recording group) that was hidden during the test.
  if (report.perGroup) {
    const groupRows = [];
    for (const group of Object.keys(report.perGroup).sort()) {
      const stats = report.perGroup[group];
      groupRows.push([describeGroup(group), stats.correct + ' / ' + stats.total, makeAccuracyBar(stats.correct / stats.total)]);
    }
    container.append(makeElement('h3', '', 'Accuracy for each hidden person'));
    container.append(makeElement('p', 'count-text',
      'Each row: that person\'s signs were hidden, and the coach had to recognize them using only everyone else.'));
    container.append(makeTable(['Person / recording', 'Correct', 'Accuracy'], groupRows));
  }

  // Plain-English list of the most common mix-ups.
  container.append(makeElement('h3', '', 'Most confused letters'));
  if (report.topConfusions.length === 0) {
    container.append(makeElement('p', '', 'No mix-ups. Every test sample was recognized correctly.'));
  } else {
    const list = makeElement('ul');
    for (const mistake of report.topConfusions.slice(0, 8)) {
      const times = mistake.count === 1 ? ' time' : ' times';
      list.append(makeElement('li', '', mistake.actual + ' was mistaken for ' + mistake.predicted + ' ' + mistake.count + times));
    }
    container.append(list);
  }

  // Per-letter accuracy table.
  const letterRows = [];
  for (const letter of STATIC_LETTERS) {
    const stats = report.perLetter[letter];
    if (stats) {
      letterRows.push([letter, stats.correct + ' / ' + stats.total, makeAccuracyBar(stats.correct / stats.total)]);
    }
  }
  container.append(makeElement('h3', '', 'Accuracy for each letter'));
  container.append(makeTable(['Letter', 'Correct', 'Accuracy'], letterRows));

  container.append(makeElement('h3', '', 'Confusion matrix'));
  container.append(makeElement('p', 'count-text',
    'Rows = the real letter. Columns = what the coach guessed. Green = right, red = mix-up.'));
  container.append(makeConfusionMatrix(report.confusion));
}

/**
 * Turns a group code from the reference data into a readable name.
 * @param {string} group - e.g. "ds1-person2" or "ds2-evaluation".
 * @returns {string} e.g. "Dataset 1, person 2".
 */
function describeGroup(group) {
  const names = {
    'ds1-person1': 'Dataset 1, person 1',
    'ds1-person2': 'Dataset 1, person 2',
    'ds1-person3': 'Dataset 1, person 3',
    'ds2-train': 'Dataset 2, main recordings',
    'ds2-test': 'Dataset 2, test photos',
    'ds2-evaluation': 'Dataset 2, evaluation videos',
    added: 'Added on the Add Samples screen',
  };
  return names[group] ?? group;
}

/**
 * Builds the confusion matrix table (real letter vs. guessed letter).
 * @param {Object<string, Object<string, number>>} confusion - actual -> predicted -> count.
 * @returns {HTMLElement} A scrollable table.
 */
function makeConfusionMatrix(confusion) {
  // Only include letters that appear somewhere, so the table isn't 24 x 24 of blanks.
  const lettersUsed = new Set();
  for (const actual of Object.keys(confusion)) {
    lettersUsed.add(actual);
    for (const predicted of Object.keys(confusion[actual])) {
      lettersUsed.add(predicted);
    }
  }
  const letters = STATIC_LETTERS.filter((letter) => lettersUsed.has(letter));

  const table = makeElement('table', 'matrix');
  const headRow = makeElement('tr');
  headRow.append(makeElement('th', '', 'real ↓ / guess →'));
  for (const letter of letters) {
    headRow.append(makeElement('th', '', letter));
  }
  table.append(headRow);

  for (const actual of letters) {
    if (!confusion[actual]) {
      continue;
    }
    const row = makeElement('tr');
    row.append(makeElement('th', '', actual));
    for (const predicted of letters) {
      const count = confusion[actual][predicted] ?? 0;
      let className = '';
      if (count > 0) {
        className = actual === predicted ? 'correct' : 'mistake';
      }
      row.append(makeElement('td', className, count > 0 ? String(count) : ''));
    }
    table.append(row);
  }

  const wrapper = makeElement('div', 'matrix-wrap');
  wrapper.append(table);
  return wrapper;
}
