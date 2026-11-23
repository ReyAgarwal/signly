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

import { STATIC_LETTERS, LETTER_TIPS, LETTER_MIXUPS } from './letters.js';
import { statsByLetter, statsByDay, letterHistory, overallStats } from './progress.js';
import { createHandDiagram } from './diagram.js';

/** Screens that use the webcam. */
export const CAMERA_SCREENS = ['record', 'free', 'learn', 'spell'];

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
 *   showCounts?:boolean, mastered?:Set<string>}} options
 *   counts = samples per letter, selected = highlighted letter,
 *   onPick = called with the letter when clicked, showCounts = show the sample count,
 *   mastered = letters signed correctly before (they get a check mark).
 * @returns {void}
 */
export function renderLetterGrid(container, options) {
  container.replaceChildren();
  const mastered = options.mastered ?? new Set();
  for (const letter of STATIC_LETTERS) {
    const count = options.counts[letter] ?? 0;
    const button = makeElement('button', 'letter-button');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(letter === options.selected));
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
 * Fills the Alphabet screen with a card for every letter.
 * @param {HTMLElement} container - The grid element.
 * @param {{counts:Object<string,number>, mastered:Set<string>, flipX:boolean,
 *   onPick:function(string):void}} options
 *   counts = samples per letter, mastered = letters signed correctly before,
 *   flipX = mirror the pictures, onPick = called when a card is clicked.
 * @returns {void}
 */
export function renderAlphabetChart(container, options) {
  container.replaceChildren();
  for (const letter of STATIC_LETTERS) {
    const card = makeElement('button', 'alphabet-card');
    card.type = 'button';
    card.setAttribute('aria-label', 'Practice the letter ' + letter);

    const top = makeElement('div', 'card-top');
    top.append(makeElement('span', 'card-letter', letter));
    top.append(createHandDiagram(letter, { flipX: options.flipX }));
    card.append(top);

    card.append(makeElement('span', 'card-tip', LETTER_TIPS[letter]));
    card.append(makeElement('span', 'mixup', LETTER_MIXUPS[letter]));

    const count = options.counts[letter] ?? 0;
    let status = count + ' samples recorded';
    if (options.mastered.has(letter)) {
      status += ' · ✓ signed correctly';
    }
    card.append(makeElement('span', 'card-status', status));

    card.addEventListener('click', () => options.onPick(letter));
    container.append(card);
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
 * Fills in the Progress screen.
 * @param {Array<Object>} attempts - Saved attempts.
 * @param {number} bestSpellScore - Best Spell-a-Word score.
 * @returns {void}
 */
export function renderProgress(attempts, bestSpellScore) {
  const overall = overallStats(attempts);
  const summary = byId('progress-summary');
  summary.replaceChildren(
    makeSummaryCard('Attempts', String(overall.total)),
    makeSummaryCard('Overall accuracy', overall.total > 0 ? formatPercent(overall.accuracy) : '-'),
    makeSummaryCard('Letters practiced', overall.lettersPracticed + ' / 24'),
    makeSummaryCard('Best Spell score', String(bestSpellScore)),
  );

  const lettersBox = byId('progress-letters');
  const daysBox = byId('progress-days');
  if (attempts.length === 0) {
    const note = 'No practice yet. Lock in letters in Learn mode or the Spell-a-Word game and your results will show up here.';
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
    'Overall accuracy: ' + formatPercent(report.accuracy) + ' (' + report.correct + ' of ' + report.total + ' test samples recognized correctly)'));

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
