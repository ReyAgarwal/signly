# ASL Fingerspelling Coach

A browser app that helps people **learn the ASL fingerspelling alphabet**. It
watches your hand through the laptop webcam, recognizes which letter you're
signing, tells you which finger to fix, and tracks your progress over time.

- **Runs 100% offline.** No internet, no accounts, no cloud. Video never leaves the laptop.
- **Plain HTML, CSS, and JavaScript.** No frameworks and no build step.
- **Checks you against real signers.** The coach compares your hand with about **6,000 hands of real people signing**, taken from two public research datasets (CC BY 4.0), using a k-nearest-neighbors (k-NN) classifier we wrote ourselves. No setup or recording is needed, and it can't learn a wrong handshape from you.
- **Keeps learning, safely.** It can save your *correct* signs to get used to your hand and camera, but only when the real signers strongly agree the sign is right.
- **24 static letters** (A–Y, without J and Z, which need motion).

> Theme fit: *"improves how people learn, teach, practice, or develop new skills."*
> The coach gives instant, specific feedback ("Curl your index finger more")
> the way a human tutor would, and lets a learner practice alone.

---

## What's in the app

| Screen | What it does |
|--------|--------------|
| **Home** | Big buttons for every mode, a status line ("120 samples recorded for 4 letters..."), and a list of keyboard shortcuts |
| **Alphabet** | A **diagram of every handshape**, with how-to text and a "Watch out" note about the letter it's most often confused with. Click or type a letter to practice it. Can be flipped for left-handed signers, and printed as a study sheet. |
| **Free Sign** | Sign anything. Shows the recognized letter, the confidence %, the actual k-NN neighbor votes, and types out letters you hold steady. |
| **Learn** | Pick a target letter. A **diagram** shows how to make it, next to a skeleton of the **average real signer's hand**. Live hints tell you which finger to fix and draw that finger in **red** on the camera *and* the diagram. Hold the right letter for half a second to get a success animation, then it moves to the next letter automatically (or press **Enter**). |
| **Spell** | Type **any word or sentence** (your name, "Nice to meet you"...) and the coach teaches you to fingerspell it, letter by letter: diagram, tip, live finger hints, and a camera check that moves on when you get each letter right. J and Z (motion letters) get written instructions. |
| **Challenge** | Timed game: spell as many words as you can. **Easy** (2–3 letters, 90 s), **Medium** (3–4 letters, 60 s, ×2 points), or **Hard** (4–6 letters, 45 s, ×3 points, no picture hints). Best score saved for each level. |
| **Progress** | Accuracy for every letter, and for every day, so you can see improvement over time. |
| **Test & Data** | **Fair accuracy test** (hides each person in turn and recognizes their signs using everyone else, shows per-person and per-letter accuracy and which letters get confused), what the coach knows (real signers / teacher-added / learned from you), the **keep learning** switch, **Export/Import**, and dataset credits. |
| **Add Samples** | *Optional teacher tool.* A fluent signer or ASL teacher can record extra correct examples (about 30 snapshots in 3 seconds). Learners never need it. |

### Keyboard shortcuts

Your hands are busy signing, so most things work from the keyboard:

| Where | Keys |
|-------|------|
| Anywhere | `1`–`8` open a screen (same order as the menu: Alphabet, Learn, Spell, Challenge, Free Sign, Progress, Test & Data, Add Samples) · `Esc` Home |
| Alphabet | Type a letter to practice it in Learn |
| Learn | `Enter` or `→` next letter · `←` previous letter · type a letter to jump to it |
| Spell | `/` type a new phrase · `→` skip a letter · `←` go back a letter |
| Challenge | `Enter` start / play again · `→` skip word |
| Free Sign | `Space` add a space · `Backspace` delete · `Delete` clear |
| Add Samples | `Space` or `Enter` record · `←` `→` change letter · type a letter to pick it |

### About the diagrams

The handshape diagrams are **drawn by our own code**, not copied from a chart:
`handPoses.js` describes each letter with a few numbers (how much each finger
bends, where the thumb points, how the hand is turned), `handModel.js` turns
those numbers into a 3D hand, and `diagram.js` draws it. Each picture shows a
**right hand as you'll see it in the mirror video**, with the same finger
colors as the live skeleton. See `docs/HOW_IT_WORKS.md` for the math.

The diagrams were **checked against the real signers**: every diagram's finger
bends are within the range real people use, thumb positions were fitted to the
real data (except M, N, T, where the thumb is hidden from the camera and the ASL
definition was used), and the coach recognizes 20 of the 24 drawings as the right
letter. A unit test keeps it that way (`tests/diagram-accuracy.test.js`).

### Where the "answer key" comes from

`data/reference-hands.json` holds the 21 hand points (no photos) of about 6,000
hands of real people signing the 24 static letters, made from two CC BY 4.0
datasets on Mendeley Data. **Fair accuracy test** (each person hidden in turn):
**76% overall**, from 54% to 88% depending on the person. `tools/README.md`
explains every step and the results. Credits are in `data/ATTRIBUTION.md`.

---

## How to run it (offline)

You need **Python 3** (already on Macs; on Windows install it from python.org
*before* competition day) and **Google Chrome**.

1. Open a terminal in this project folder.
2. Start the server:
   ```bash
   python3 serve.py        # Mac / Linux
   python serve.py         # Windows
   ```
   You should see `ASL Fingerspelling Coach is running at http://localhost:8000`.
   (`python3 -m http.server 8000` also works on most computers. `serve.py` is
   safer because it fixes a Windows problem where `.js` files are sent with the
   wrong type and Chrome refuses to run them.)
3. Open **http://localhost:8000** in Chrome.
4. When Chrome asks to use the camera, click **Allow**.
5. To stop the server, press `Ctrl+C` in the terminal.

> **Don't double-click `index.html`.** Browsers block the camera and JavaScript
> modules on `file://` pages. The app shows a warning if you do this.

Everything the app needs is inside this folder:
- `vendor/mediapipe/`: the MediaPipe Tasks Vision library and its WebAssembly engine (see `vendor/mediapipe/README.md`)
- `models/hand_landmarker.task`: the hand-tracking model

**Before competition:** turn off Wi-Fi and run through every mode once, to prove it works offline.

### First time using it

There's nothing to set up: the coach already knows every letter.

1. Open the **Alphabet** (`1`) and look through the handshapes.
2. Open **Learn** (`2`), copy the picture, and hold the sign steady.
3. Type your name on **Spell** (`3`), then try the timed **Challenge** (`4`).

**Optional:** to back up progress (and anything the coach learned from you), use
**Test & Data → Export**. A fluent signer can add extra examples on **Add Samples**.

---

## How to run the tests

The unit tests use Node's built-in test runner. **There is nothing to install.**

```bash
node --test          # or: npm test
```

There are 91 tests in `tests/`:

| Test file | What it checks |
|-----------|----------------|
| `landmarks.test.js` | Normalization: wrist moved to the origin, palm size scaled to 1, left hands mirrored, aspect-ratio fix, moved/resized hands give the same features |
| `classifier.test.js` | k-NN: distance, nearest neighbors, voting, tie-breaks, confidence %, hold-out split, accuracy test, confusion list |
| `hints.test.js` | Angles: vector angles, joint bends, finger bends, templates, which finger to fix, hint wording |
| `smoothing.test.js` | Majority vote, hold-to-lock timing, one lock per hold, reset for double letters |
| `games-progress-storage.test.js` | Challenge scoring, timer, difficulty levels and word lengths, progress statistics, saving, loading, import/export |
| `phrase.test.js` | Turning typed text into letters for Spell (uppercase, words, J/Z, skipping punctuation, length limit) |
| `handModel.test.js` | Diagram hand model: bone lengths, rotations, the thumb really touching the fingertip in F/O/D/W, A/S/T thumbs in different places, back-to-front drawing order |
| `keyboard-settings.test.js` | Which key does what on each screen, not stealing keys from buttons/text boxes, saving settings |
| `features-reference-learning.test.js` | Feature vector (tilting the hand doesn't change the shape part), the real-signer data (all 24 letters, several people, valid numbers, credits), the keep-learning safety rules, and the fair leave-one-person-out test |
| `diagram-accuracy.test.js` | Every diagram's finger bends match real signers, and the coach recognizes at least 20 of 24 diagrams |

`tests/helpers/fakeHand.js` builds pretend hands with exact, known finger bends,
so the tests never need a camera.

---

## Which file does what

```
index.html                  The single web page; each screen is a <section>
css/style.css               All styling (large text, high contrast)
serve.py                    Tiny offline web server with correct file types
package.json                Lets you run "npm test" (no dependencies)

js/
  main.js                   Starts the app, switches screens, runs the per-frame loop
  camera.js                 Webcam + MediaPipe Hand Landmarker + friendly camera errors
  landmarks.js              NORMALIZATION: center on wrist, scale by palm, mirror left hands
  classifier.js             k-NEAREST NEIGHBORS + the accuracy test / confusion matrix
  hints.js                  FINGER ANGLES, letter templates, "curl your index finger" hints
  smoothing.js              MAJORITY VOTE + hold-0.5-seconds-to-lock
  games.js                  Challenge rules (word list, difficulty levels, timer, scoring)
  phrase.js                 Turns typed text into letters to fingerspell (for Spell)
  progress.js               Accuracy-per-letter and per-day statistics
  storage.js                localStorage save/load (with try/catch) + JSON export/import
  ui.js                     Page helpers: screens, banners, letter grid, tables, animation
  draw.js                   Draws the hand skeleton (live + reference), red highlight
  letters.js                The 24 letters, a description of each handshape, and common mix-ups
  handPoses.js              DIAGRAM RECIPES: finger bends + thumb + hand angle for each letter
  handModel.js              Turns a recipe into a 3D hand (21 points), using rotations
  diagram.js                Draws the 3D hand as an SVG picture (back-to-front)
  keyboard.js               Decides what each key press means on each screen
  features.js               The 86-number hand description k-NN compares (shape, direction, bends, thumb, crossing)
  reference.js              Loads the real-signer answer key (data/reference-hands.json)
  learning.js               "Keep learning" safety rules (only learn when real signers agree)

data/reference-hands.json   ~6,000 real signers' hands (numbers only), from 2 CC BY 4.0 datasets
data/ATTRIBUTION.md         Dataset credits and what we changed
tools/                      How the reference data was built + the diagram checker (not needed to run the app)
  modes/recordMode.js       Add Samples screen (optional teacher tool)
  modes/freeMode.js         Free Sign screen
  modes/learnMode.js        Learn screen (diagram, hints, auto-advance)
  modes/spellMode.js        Spell screen (type a phrase, learn to sign it)
  modes/challengeMode.js    Challenge screen (timed game with difficulty levels)

tests/                      Unit tests (node --test)
docs/HOW_IT_WORKS.md        Plain-language explanation of the math, with examples
vendor/mediapipe/           MediaPipe library files (Apache-2.0, unchanged)
models/                     Hand landmark model
```

**The four "brain" files** are `landmarks.js` → `classifier.js` → `smoothing.js`
→ `hints.js`. Read them in that order. `docs/HOW_IT_WORKS.md` explains each one.

---

## Privacy

- The webcam video is processed **on the laptop only** and is never saved or sent anywhere.
- When a sign is learned (or added on Add Samples), the app saves just **63 numbers** (21 hand points × x, y, z), not a picture.
- Data lives in the browser's localStorage. **Test & Data → Delete added + learned samples and progress** erases it.
- The real-signer reference contains only hand-point numbers, never photos or names.
- We use MediaPipe **0.10.35**, the newest version that sends no usage metrics to Google
  (version 1.x and later do). See `vendor/mediapipe/README.md`.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Camera permission was denied" | Click the camera icon at the right end of Chrome's address bar → Allow → **Try the camera again**. |
| "The camera is busy" | Close Zoom, Teams, FaceTime, or other tabs using the camera. |
| "No hand detected" | Hold one hand inside the video, about an arm's length away, with light on your hand (not behind you). |
| A letter is often wrong | Check the diagram and the "Watch out" note. Face the camera, keep your whole hand in view, and use good light. The hardest letters for the coach are P, X, R, and D (see **Test & Data**). A fluent signer can also add examples on **Add Samples**. |
| Blank page / "code didn't load" | You opened the file directly. Run `python3 serve.py` and go to http://localhost:8000. |
| "Address already in use" when starting the server | Another server is using port 8000. Stop it, or run `python3 serve.py 8001` and open http://localhost:8001. |
