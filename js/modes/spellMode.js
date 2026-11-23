/**
 * spellMode.js
 * ------------
 * The Spell-a-Word screen. The game RULES live in games.js; this file
 * connects those rules to the camera and the web page.
 */

import { LETTER_TIPS } from '../letters.js';
import { LetterSmoother } from '../smoothing.js';
import {
  chooseGameWords, createSpellGame, currentWord, currentTargetLetter,
  submitLetter, goToNextWord, timeLeftMs, isGameOver, GAME_DURATION_MS,
} from '../games.js';
import { renderHandDiagram } from '../diagram.js';
import { byId, makeElement, setMeter, showSuccessBurst } from '../ui.js';

/** After pressing Start, give the player this long to get their hand ready. */
const GET_READY_MS = 1500;

/**
 * Creates the Spell-a-Word mode.
 * @param {Object} app - Shared app helpers and data (see main.js).
 * @returns {{enter:function, exit:function, onFrame:function, handleShortcut:function}} The mode.
 */
export function createSpellMode(app) {
  const smoother = new LetterSmoother();
  let game = null;
  let getReadyUntilMs = 0;

  const startButton = byId('spell-start');
  const skipButton = byId('spell-skip');
  const feedback = byId('spell-feedback');
  const pictureBox = byId('spell-picture-hints');
  const diagram = byId('spell-diagram');

  /**
   * Shows a feedback message in green (good), red (bad), or normal.
   * @param {string} text - The message.
   * @param {''|'good'|'bad'} kind - The color style.
   * @returns {void}
   */
  function say(text, kind = '') {
    feedback.textContent = text;
    feedback.className = 'feedback ' + kind;
  }

  /**
   * Draws the current word as letter boxes: done (green), current (blue), to-do.
   * @param {boolean} shakeCurrent - True to shake the current box (wrong letter).
   * @returns {void}
   */
  function renderWord(shakeCurrent = false) {
    const wordBox = byId('spell-word');
    wordBox.replaceChildren();
    if (!game) {
      return;
    }
    const word = currentWord(game);
    for (let i = 0; i < word.length; i++) {
      const box = makeElement('span', 'spell-letter', word[i]);
      if (i < game.letterIndex) {
        box.classList.add('done');
      } else if (i === game.letterIndex) {
        box.classList.add('current');
        if (shakeCurrent) {
          box.classList.add('wrong');
        }
      }
      wordBox.append(box);
    }
    const target = currentTargetLetter(game);
    byId('spell-target-tip').textContent = 'Next: ' + target + '. ' + LETTER_TIPS[target];
    showPictureHint(target);
  }

  /**
   * Shows a small diagram of the letter to sign next (if picture hints are on).
   * @param {string|null} letter - The next letter, or null to hide the picture.
   * @returns {void}
   */
  function showPictureHint(letter) {
    const show = letter !== null && app.settings.spellPictureHints;
    // <svg> elements don't support ".hidden = true" like HTML elements do,
    // so we add or remove the hidden attribute directly.
    diagram.toggleAttribute('hidden', !show);
    if (show) {
      renderHandDiagram(diagram, letter, { flipX: app.settings.flipDiagrams });
    }
  }

  /**
   * Updates the timer, score, and best-score numbers.
   * @param {number} nowMs - Current performance.now() time.
   * @returns {void}
   */
  function renderScoreboard(nowMs) {
    const secondsLeft = game ? Math.ceil(timeLeftMs(game, nowMs) / 1000) : GAME_DURATION_MS / 1000;
    byId('spell-timer').textContent = String(secondsLeft);
    byId('spell-score').textContent = String(game ? game.score : 0);
    byId('spell-best').textContent = String(app.data.bestSpellScore);
  }

  /**
   * Starts a new game with words the user can actually spell.
   * @returns {void}
   */
  function startGame() {
    const recorded = app.recordedLetters();
    if (recorded.length === 0) {
      say('No samples recorded yet. Go to Record and record some letters first.', 'bad');
      return;
    }
    if (!app.isTrackerReady()) {
      say('The camera is not ready yet. Wait for the video to appear, then press Start.', 'bad');
      return;
    }

    const { words, usingPracticeWords } = chooseGameWords(recorded);
    game = createSpellGame(words, performance.now());
    smoother.reset();
    getReadyUntilMs = performance.now() + GET_READY_MS;
    startButton.disabled = true;
    skipButton.disabled = false;
    if (usingPracticeWords) {
      say('Using practice letter combos, because no real words can be made from your recorded letters yet. Record more letters (try C, A, T, H, I) to unlock words!');
    } else {
      say('Go! Sign the blue letter and hold it steady.');
    }
    renderWord();
    renderScoreboard(performance.now());
  }

  /**
   * Ends the game, saves a new best score, and shows the results.
   * @returns {void}
   */
  function endGame() {
    if (!game) {
      return;
    }
    const finalScore = game.score;
    let message = 'Time\'s up! You scored ' + finalScore + ' points: ' + game.wordsCompleted + ' words, ' + game.lettersCorrect + ' correct letters.';
    if (finalScore > app.data.bestSpellScore) {
      app.setBestSpellScore(finalScore);
      message += ' New best score!';
    }
    game = null;
    startButton.disabled = false;
    startButton.textContent = '▶ Play again';
    skipButton.disabled = true;
    setMeter(byId('spell-hold-bar'), 0);
    byId('spell-target-tip').textContent = '';
    showPictureHint(null);
    renderWord();
    say(message, 'good');
  }

  /**
   * Handles a letter the smoother locked in.
   * @param {string} letter - The locked-in letter.
   * @param {number} nowMs - Current performance.now() time.
   * @returns {void}
   */
  function handleLock(letter, nowMs) {
    const result = submitLetter(game, letter, nowMs);
    if (result.outcome === 'game-over') {
      return;
    }

    // Progress is saved for the letter they were SUPPOSED to sign.
    const correct = result.outcome !== 'wrong';
    app.recordAttempt(result.expected, correct, 'spell');

    if (result.outcome === 'wrong') {
      say('That looked like ' + letter + '. The next letter is ' + result.expected + '.', 'bad');
      renderWord(true);
      return;
    }

    // Double letter (the second O in "BOOK")? Then forget the recent frames,
    // so continuing to hold O locks it in again. For any other next letter we
    // do NOT reset: the smoother then won't re-lock the letter still being
    // held, so a slow hand change isn't counted as a mistake.
    if (currentTargetLetter(game) === letter) {
      smoother.reset();
    }
    if (result.outcome === 'word-complete') {
      showSuccessBurst('Word complete! +bonus');
      say('Nice! You finished a word.', 'good');
    } else {
      say('Yes! ' + letter + ' is correct.', 'good');
    }
    renderWord();
  }

  /**
   * Skips to the next word (does nothing if no game is running).
   * @returns {void}
   */
  function skipWord() {
    if (!game) {
      return;
    }
    goToNextWord(game);
    smoother.reset();
    say('Skipped. Here\'s a new word.');
    renderWord();
  }

  startButton.addEventListener('click', startGame);
  skipButton.addEventListener('click', skipWord);
  pictureBox.addEventListener('change', () => {
    app.setSetting('spellPictureHints', pictureBox.checked);
    showPictureHint(game ? currentTargetLetter(game) : null);
  });

  return {
    /** Called when this screen opens. @returns {void} */
    enter() {
      pictureBox.checked = app.settings.spellPictureHints;
      renderScoreboard(performance.now());
      if (app.data.samples.length === 0) {
        say('No samples recorded yet. Go to Record and record some letters first.', 'bad');
      } else if (!game) {
        say('Press Start. You have 60 seconds to spell as many words as you can.');
      }
    },

    /** Called when leaving this screen: the game ends. @returns {void} */
    exit() {
      endGame();
    },

    /**
     * Handles a keyboard shortcut (see keyboard.js).
     * @param {string} action - "start" or "skip".
     * @returns {void}
     */
    handleShortcut(action) {
      if (action === 'start' && !game) {
        startGame();
      } else if (action === 'skip') {
        skipWord();
      }
    },

    /**
     * Called for every video frame.
     * @param {Object|null} hand - The processed hand, or null if none is visible.
     * @param {number} nowMs - performance.now() time of this frame.
     * @returns {{highlightFinger:null}} No finger highlight in this game.
     */
    onFrame(hand, nowMs) {
      if (!game) {
        return { highlightFinger: null };
      }
      if (isGameOver(game, nowMs)) {
        endGame();
        return { highlightFinger: null };
      }

      renderScoreboard(nowMs);
      // During the get-ready pause we keep clearing the smoother, so nothing can lock in.
      if (nowMs < getReadyUntilMs) {
        smoother.reset();
      }
      const { smooth } = app.recognize(hand, smoother, nowMs);
      setMeter(byId('spell-hold-bar'), smooth.holdProgress);
      if (smooth.lockedLetter) {
        handleLock(smooth.lockedLetter, nowMs);
      }
      return { highlightFinger: null };
    },
  };
}
