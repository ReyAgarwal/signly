/**
 * quizScreen.js
 * -------------
 * The reading quiz on the Alphabet page: "Which letter is this?"
 *
 * Shows a real signer's photo (or a diagram), and four letters to choose
 * from. Wrong choices are usually look-alikes (quiz.js), so the quiz trains
 * exactly the differences learners mix up. No camera needed.
 */

import { STATIC_LETTERS } from './letters.js';
import { makeQuestion } from './quiz.js';
import { createHandDiagram } from './diagram.js';
import { byId, makeElement, renderLetterPhotos } from './ui.js';

/**
 * Creates the quiz.
 * @param {Object} app - Shared app helpers and data (see main.js), for settings.
 * @returns {{show:function, hide:function, isOpen:function, answer:function, next:function}} The quiz.
 */
export function createQuiz(app) {
  let question = null;
  let answered = false;
  let asked = 0;
  let right = 0;
  let streak = 0;
  let open = false;

  const feedback = byId('quiz-feedback');
  const useDiagrams = byId('quiz-use-diagrams');

  /**
   * Updates the score and streak chips.
   * @returns {void}
   */
  function showScore() {
    byId('quiz-score').textContent = right + ' / ' + asked + ' correct';
    byId('quiz-streak').textContent = 'Streak ' + streak + (streak >= 3 ? ' 🔥' : '');
  }

  /**
   * Shows a new question.
   * @returns {void}
   */
  function next() {
    question = makeQuestion(STATIC_LETTERS, Math.random, question ? question.answer : null);
    answered = false;
    feedback.textContent = '';
    feedback.className = 'feedback';

    const picture = byId('quiz-picture');
    picture.replaceChildren();
    if (useDiagrams.checked) {
      picture.append(createHandDiagram(question.answer, { flipX: app.settings.flipDiagrams, className: 'hand-diagram quiz-diagram' }));
    } else {
      // Show ONE photo, picked at random from the two people.
      const holder = makeElement('div', 'letter-photos');
      renderLetterPhotos(holder, question.answer, app.settings.flipDiagrams, 2);
      const photos = Array.from(holder.children);
      picture.append(photos[Math.floor(Math.random() * photos.length)]);
    }

    const choices = byId('quiz-choices');
    choices.replaceChildren();
    for (const letter of question.choices) {
      const button = makeElement('button', 'quiz-choice', letter);
      button.type = 'button';
      button.addEventListener('click', () => answer(letter));
      choices.append(button);
    }
    showScore();
  }

  /**
   * Checks an answer and shows whether it was right.
   * @param {string} letter - The letter the user picked.
   * @returns {void}
   */
  function answer(letter) {
    if (!question || answered || !question.choices.includes(letter)) {
      return;
    }
    answered = true;
    asked += 1;
    const correct = letter === question.answer;
    if (correct) {
      right += 1;
      streak += 1;
      feedback.textContent = 'Yes! That\'s ' + question.answer + '. Press Enter for the next one.';
      feedback.className = 'feedback good';
    } else {
      streak = 0;
      feedback.textContent = 'Not quite: that was ' + question.answer + ', not ' + letter + '. Look closely at the thumb and fingers.';
      feedback.className = 'feedback bad';
    }
    for (const button of byId('quiz-choices').children) {
      button.disabled = true;
      if (button.textContent === question.answer) {
        button.classList.add('right');
      } else if (button.textContent === letter) {
        button.classList.add('wrong');
      }
    }
    showScore();
  }

  byId('quiz-next').addEventListener('click', next);
  useDiagrams.addEventListener('change', next);

  return {
    /** Opens the quiz tab. @returns {void} */
    show() {
      open = true;
      if (!question) {
        next();
      }
    },
    /** Closes the quiz tab. @returns {void} */
    hide() {
      open = false;
    },
    /** @returns {boolean} True while the quiz tab is open. */
    isOpen() {
      return open;
    },
    answer,
    next,
  };
}
