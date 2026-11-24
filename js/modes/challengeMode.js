/**
 * challengeMode.js
 * ----------------
 * The Challenge screen: a timed game of spelling words. The game RULES
 * (words, timer, scoring, difficulty levels) live in games.js; this file
 * connects those rules to the camera and the web page.
 */

import { LETTER_TIPS } from '../letters.js';
import { LetterSmoother } from '../smoothing.js';
import {
  chooseGameWords, createChallengeGame, currentWord, currentTargetLetter,
  submitLetter, goToNextWord, timeLeftMs, isGameOver, getDifficulty, POINTS_PER_LETTER, WORD_BONUS,
} from '../games.js';
import { renderHandDiagram } from '../diagram.js';
import { byId, makeElement, setMeter, showSuccessBurst } from '../ui.js';

/** After pressing Start, give the player this long to get their hand ready. */
const GET_READY_MS = 1500;

/**
 * Creates the Challenge mode.
 * @param {Object} app - Shared app helpers and data (see main.js).
 * @returns {{enter:function, exit:function, onFrame:function, handleShortcut:function}} The mode.
 */
export function createChallengeMode(app) {
  const smoother = new LetterSmoother();
  let game = null;
  let getReadyUntilMs = 0;

  const startButton = byId('challenge-start');
  const skipButton = byId('challenge-skip');
  const feedback = byId('challenge-feedback');
  const pictureBox = byId('challenge-picture-hints');
  const diagram = byId('challenge-diagram');
  const difficultyButtons = byId('challenge-difficulty').querySelectorAll('button');

  /**
   * The difficulty the player picked (saved in settings).
   * @returns {Object} The level's settings from games.js.
   */
  function level() {
    return getDifficulty(app.settings.challengeDifficulty);
  }

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
   * Highlights the chosen difficulty and updates the rules line and picture option.
   * @returns {void}
   */
  function showDifficulty() {
    for (const button of difficultyButtons) {
      button.setAttribute('aria-checked', String(button.dataset.difficulty === app.settings.challengeDifficulty));
      // You can't change difficulty in the middle of a game.
      button.disabled = game !== null;
    }
    const current = level();
    pictureBox.disabled = !current.pictures;
    pictureBox.checked = current.pictures && app.settings.spellPictureHints;
    byId('challenge-picture-note').textContent = current.pictures ? '' : '(not allowed on Hard)';
    byId('challenge-rules').textContent = current.label + ': ' + (current.durationMs / 1000) + ' seconds, words of '
      + current.minLength + '–' + current.maxLength + ' letters. +' + POINTS_PER_LETTER * current.multiplier
      + ' per letter, +' + WORD_BONUS * current.multiplier + ' per finished word.';
  }

  /**
   * Draws the current word as letter boxes: done (green), current (blue), to-do.
   * @param {boolean} shakeCurrent - True to shake the current box (wrong letter).
   * @returns {void}
   */
  function renderWord(shakeCurrent = false) {
    const wordBox = byId('challenge-word');
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
    byId('challenge-target-tip').textContent = 'Next: ' + target + '. ' + LETTER_TIPS[target];
    showPictureHint(target);
  }

  /**
   * Shows a small diagram of the letter to sign next (if pictures are on and allowed).
   * @param {string|null} letter - The next letter, or null to hide the picture.
   * @returns {void}
   */
  function showPictureHint(letter) {
    const show = letter !== null && level().pictures && app.settings.spellPictureHints;
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
    const secondsLeft = game ? Math.ceil(timeLeftMs(game, nowMs) / 1000) : level().durationMs / 1000;
    byId('challenge-timer').textContent = String(secondsLeft);
    byId('challenge-score').textContent = String(game ? game.score : 0);
    byId('challenge-best').textContent = String(app.data.bestScores[app.settings.challengeDifficulty] ?? 0);
  }

  /**
   * Starts a new game at the chosen difficulty.
   * @returns {void}
   */
  function startGame() {
    const known = app.knownLetters();
    if (known.length === 0) {
      say('The coach has no reference hands loaded. Reload the page (see the message at the top).', 'bad');
      return;
    }
    if (!app.isTrackerReady()) {
      say('The camera is not ready yet. Wait for the video to appear, then press Start.', 'bad');
      return;
    }

    const current = level();
    const { words } = chooseGameWords(known, app.settings.challengeDifficulty);
    game = createChallengeGame(words, performance.now(), current.durationMs, current.multiplier);
    smoother.reset();
    getReadyUntilMs = performance.now() + GET_READY_MS;
    startButton.disabled = true;
    skipButton.disabled = false;
    showDifficulty();
    say('Go! Sign the blue letter and hold it steady.');
    renderWord();
    renderScoreboard(performance.now());
  }

  /**
   * Ends the game, saves a new best score for this difficulty, and shows the results.
   * @returns {void}
   */
  function endGame() {
    if (!game) {
      return;
    }
    const finalScore = game.score;
    const difficulty = app.settings.challengeDifficulty;
    let message = 'Time\'s up! ' + finalScore + ' points: ' + game.wordsCompleted + ' words, ' + game.lettersCorrect + ' correct letters.';
    if (finalScore > (app.data.bestScores[difficulty] ?? 0)) {
      app.setBestScore(difficulty, finalScore);
      message += ' New best score for ' + level().label + '!';
    }
    game = null;
    startButton.disabled = false;
    startButton.lastChild.textContent = ' Play again';
    skipButton.disabled = true;
    setMeter(byId('challenge-hold-bar'), 0);
    byId('challenge-target-tip').textContent = '';
    showPictureHint(null);
    showDifficulty();
    renderWord();
    renderScoreboard(performance.now());
    say(message, 'good');
  }

  /**
   * Handles a letter the smoother locked in.
   * @param {string} letter - The locked-in letter.
   * @param {number} nowMs - Current performance.now() time.
   * @param {Object} hand - The hand at that moment (used for "keep learning").
   * @returns {void}
   */
  function handleLock(letter, nowMs, hand) {
    const result = submitLetter(game, letter, nowMs);
    if (result.outcome === 'game-over') {
      return;
    }

    // Progress is saved for the letter they were SUPPOSED to sign.
    const correct = result.outcome !== 'wrong';
    app.recordAttempt(result.expected, correct, 'challenge');
    if (!correct) {
      say('That looked like ' + letter + '. The next letter is ' + result.expected + '.', 'bad');
      renderWord(true);
      return;
    }
    app.learnFrom(hand, result.expected, letter);

    // Double letter (the second O in "BOOK")? Then forget the recent frames,
    // so continuing to hold O locks it in again. For any other next letter we
    // do NOT reset: the smoother then won't re-lock the letter still being
    // held, so a slow hand change isn't counted as a mistake.
    if (currentTargetLetter(game) === letter) {
      smoother.reset();
    }
    if (result.outcome === 'word-complete') {
      showSuccessBurst('Word complete!');
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
  for (const button of difficultyButtons) {
    button.addEventListener('click', () => {
      app.setSetting('challengeDifficulty', button.dataset.difficulty);
      showDifficulty();
      renderScoreboard(performance.now());
    });
  }

  return {
    /** Called when this screen opens. @returns {void} */
    enter() {
      showDifficulty();
      renderScoreboard(performance.now());
      if (app.pool.length === 0) {
        say('The coach has no reference hands loaded. Reload the page (see the message at the top).', 'bad');
      } else if (!game) {
        say('Pick a difficulty and press Start (or Enter).');
      }
    },

    /** Redraws the picture hint (after the Right / Left hand switch changes). @returns {void} */
    refreshDiagrams() {
      showPictureHint(game ? currentTargetLetter(game) : null);
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
      setMeter(byId('challenge-hold-bar'), smooth.holdProgress);
      if (smooth.lockedLetter) {
        handleLock(smooth.lockedLetter, nowMs, hand);
      }
      return { highlightFinger: null };
    },
  };
}
