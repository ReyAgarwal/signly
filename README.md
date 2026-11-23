# ASL Fingerspelling Coach

A browser app that helps people **learn the ASL fingerspelling alphabet**. It
watches your hand through the laptop webcam, recognizes which letter you're
signing, tells you which finger to fix, and tracks your progress over time.

- **Runs 100% offline.** No internet, no accounts, no cloud. Video never leaves the laptop.
- **Plain HTML, CSS, and JavaScript.** No frameworks and no build step.
- **Learns from your own hands.** You record samples, and the coach uses them to recognize letters with a k-nearest-neighbors (k-NN) classifier we wrote ourselves.
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
| **Record** | Pick a letter (the diagram shows the shape to make), press Record or Space, and the coach saves ~30 snapshots of your hand in 3 seconds. Shows the sample count for every letter, and lets you delete a letter's samples. |
| **Free Sign** | Sign anything. Shows the recognized letter, the confidence %, the actual k-NN neighbor votes, and types out letters you hold steady. |
| **Learn** | Pick a target letter. A **diagram** shows how to make it, next to a skeleton of the average of your recorded samples. Live hints tell you which finger to fix and draw that finger in **red** on the camera *and* the diagram. Hold the right letter for half a second to get a success animation, then it moves to the next letter automatically (or press **Enter**). Letters with no samples yet can still be studied from the diagram. |
| **Spell-a-Word** | 60-second game: spell short words letter by letter, with a small picture of the next letter (can be turned off). +10 per letter, +20 per word. Saves your best score. |
| **Progress** | Accuracy for every letter, and for every day, so you can see improvement over time. |
| **Test & Data** | **Accuracy test** (hides 20% of samples, measures accuracy, shows which letters get confused) and **Export/Import** of all data as a JSON file. |

### Keyboard shortcuts

Your hands are busy signing, so most things work from the keyboard:

| Where | Keys |
|-------|------|
| Anywhere | `1`–`7` open a screen (same order as the menu) · `Esc` Home |
| Alphabet | Type a letter to practice it in Learn |
| Record | `Space` or `Enter` record · `←` `→` change letter · type a letter to pick it |
| Learn | `Enter` or `→` next letter · `←` previous letter · type a letter to jump to it |
| Free Sign | `Space` add a space · `Backspace` delete · `Delete` clear |
| Spell | `Enter` start / play again · `→` skip word |

### About the diagrams

The handshape diagrams are **drawn by our own code**, not copied from a chart:
`handPoses.js` describes each letter with a few numbers (how much each finger
bends, where the thumb points, how the hand is turned), `handModel.js` turns
those numbers into a 3D hand, and `diagram.js` draws it. Each picture shows a
**right hand as you'll see it in the mirror video**, with the same finger
colors as the live skeleton. See `docs/HOW_IT_WORKS.md` for the math.

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

### First-time setup (record samples)

The coach doesn't know any letters until you teach it:

1. Look through the **Alphabet** screen to see each handshape.
2. Go to **Record**.
3. Click a letter (start with **A**), copy the diagram, and press **Record (3 sec)** (or `Space`).
   After the 3-2-1 countdown, move your hand slightly while it records.
4. Do this 2 or 3 times per letter (aim for 30–60+ samples per letter). Press `→` for the next letter.
5. For best results, have **several teammates** record, and use **both hands**.
6. Go to **Test & Data → Export** to back up your samples. Share the file so
   teammates can **Import** it (imports are merged, and duplicates are skipped).

---

## How to run the tests

The unit tests use Node's built-in test runner. **There is nothing to install.**

```bash
node --test          # or: npm test
```

There are 72 tests in `tests/`:

| Test file | What it checks |
|-----------|----------------|
| `landmarks.test.js` | Normalization: wrist moved to the origin, palm size scaled to 1, left hands mirrored, aspect-ratio fix, moved/resized hands give the same features |
| `classifier.test.js` | k-NN: distance, nearest neighbors, voting, tie-breaks, confidence %, hold-out split, accuracy test, confusion list |
| `hints.test.js` | Angles: vector angles, joint bends, finger bends, templates, which finger to fix, hint wording |
| `smoothing.test.js` | Majority vote, hold-to-lock timing, one lock per hold, reset for double letters |
| `games-progress-storage.test.js` | Spell-a-Word scoring and timer, progress statistics, saving, loading, import/export |
| `handModel.test.js` | Diagram hand model: bone lengths, rotations, the thumb really touching the fingertip in F/O/D/W, A/S/T thumbs in different places, back-to-front drawing order |
| `keyboard-settings.test.js` | Which key does what on each screen, not stealing keys from buttons/text boxes, saving settings |

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
  games.js                  Spell-a-Word rules (words, timer, scoring)
  progress.js               Accuracy-per-letter and per-day statistics
  storage.js                localStorage save/load (with try/catch) + JSON export/import
  ui.js                     Page helpers: screens, banners, letter grid, tables, animation
  draw.js                   Draws the hand skeleton (live + reference), red highlight
  letters.js                The 24 letters, a description of each handshape, and common mix-ups
  handPoses.js              DIAGRAM RECIPES: finger bends + thumb + hand angle for each letter
  handModel.js              Turns a recipe into a 3D hand (21 points), using rotations
  diagram.js                Draws the 3D hand as an SVG picture (back-to-front)
  keyboard.js               Decides what each key press means on each screen
  modes/recordMode.js       Record Samples screen
  modes/freeMode.js         Free Sign screen
  modes/learnMode.js        Learn screen (diagram, hints, auto-advance)
  modes/spellMode.js        Spell-a-Word screen

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
- When you record a sample, the app saves just **63 numbers** (21 hand points × x, y, z), not a picture.
- Data lives in the browser's localStorage. **Test & Data → Delete ALL** erases it.
- We use MediaPipe **0.10.35**, the newest version that sends no usage metrics to Google
  (version 1.x and later do). See `vendor/mediapipe/README.md`.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Camera permission was denied" | Click the camera icon at the right end of Chrome's address bar → Allow → **Try the camera again**. |
| "The camera is busy" | Close Zoom, Teams, FaceTime, or other tabs using the camera. |
| "No hand detected" | Hold one hand inside the video, about an arm's length away, with light on your hand (not behind you). |
| A letter is often wrong | Record more samples of it (and of the letter it's confused with) from different angles. Check **Test & Data → Run accuracy test**. |
| Blank page / "code didn't load" | You opened the file directly. Run `python3 serve.py` and go to http://localhost:8000. |
| "Address already in use" when starting the server | Another server is using port 8000. Stop it, or run `python3 serve.py 8001` and open http://localhost:8001. |
