# How the ASL Fingerspelling Coach Works

This document explains the "brain" of the app in plain language, with small
examples you can check with a calculator. If a judge asks "how does it
recognize letters?", the answer is in here.

## The big picture

Every video frame (about 30 per second) goes through these steps:

```
 Webcam frame
     │
     ▼
 1. MediaPipe Hand Landmarker  ──►  21 points (x, y, z) on the hand
     │                               (camera.js)
     ▼
 2. Normalize                  ──►  63 numbers that describe only the hand's SHAPE
     │                               (landmarks.js)
     ▼
 3. k-Nearest Neighbors        ──►  "B, 80% confident"
     │                               (classifier.js)
     ▼
 4. Smoothing                  ──►  "B is steady... held 0.5 s... LOCKED IN!"
     │                               (smoothing.js)
     ▼
 5. Finger hints (Learn mode)  ──►  "Curl your index finger more." (index drawn red)
                                     (hints.js)
```

We did **not** train a neural network. MediaPipe (made by Google) finds the
hand points. Everything after that is math we wrote ourselves.

---

## Step 1: MediaPipe finds 21 hand landmarks

MediaPipe's Hand Landmarker is a pre-trained model that looks at the picture
and returns 21 points on the hand:

```
                 8   12  16  20        ← fingertips
                 |   |   |   |
                 7   11  15  19
                 |   |   |   |
         4       6   10  14  18
          \      |   |   |   |
           3     5---9---13--17        ← knuckles
            \    |          /
             2   |         /
              \  |        /
               1 |       /
                \|      /
                 0 ────               ← wrist
```

Each point has:
- **x**: how far across the picture (0 = left edge, 1 = right edge)
- **y**: how far down the picture (0 = top, 1 = bottom)
- **z**: depth (negative = closer to the camera than the wrist)

It also says whether it thinks the hand is a "Left" or "Right" hand.

---

## Step 2: Normalization (landmarks.js)

**Problem:** The raw numbers depend on *where* your hand is and *how big* it
looks, not just on what letter you're making. A "B" in the top-left corner
and a "B" in the bottom-right have totally different x and y values. We need
numbers that only describe the **shape**.

We fix this in four steps.

### 2a. Fix the stretched picture

The camera picture is 640 × 480 (wider than tall), but MediaPipe measures x
as a fraction of the **width** and y as a fraction of the **height**. So
x = 0.1 means 64 pixels, but y = 0.1 means only 48 pixels. We multiply x (and z)
by 640 ÷ 480 = 1.33 so both use the same units. Without this, a hand would
look squished sideways.

### 2b. Move the wrist to (0, 0, 0)

Subtract the wrist's position from **every** point. This slides the hand so
the wrist sits at the origin.

| | Wrist | Middle knuckle (point 9) |
|--|-------|--------------------------|
| Hand near the top-left | (0.30, 0.50) | (0.30, 0.40) |
| After subtracting the wrist | **(0, 0)** | **(0, −0.10)** |

Now the position of the hand in the picture doesn't matter.

### 2c. Scale by palm size

A hand close to the camera looks big; far away it looks small. We measure the
**palm size** (the distance from the wrist to the middle knuckle) and divide
every coordinate by it. Now every hand is exactly "1 palm" big.

Example with two hands making the same shape:

| | Middle knuckle after 2b | Palm size | After dividing |
|--|------------------------|-----------|----------------|
| Far-away hand | (0, −0.10) | 0.10 | **(0, −1)** |
| Close-up hand | (0, −0.20) | 0.20 | **(0, −1)** |

Same shape → same numbers. 🎉

### 2d. Mirror left hands

A left hand is a mirror image of a right hand. If MediaPipe says "Left", we
flip it by multiplying every x by −1. Now a left-hand "B" has the same numbers
as a right-hand "B", so **either hand works** and samples from both hands help
each other.

(Small detail: our video isn't mirrored before MediaPipe sees it, so the label
might be the *opposite* of the hand you're actually using. That doesn't matter,
because all we need is to flip the **same way every time**.)

### What we do NOT normalize: rotation

We don't rotate hands to a standard angle, on purpose. Some ASL letters have
the **same handshape** and differ only by direction:

- **H** (fingers sideways) vs **U** (fingers up)
- **P** (pointing down) vs **K** (pointing up)
- **Q** (pointing down) vs **G** (pointing sideways)

If we removed rotation, the coach couldn't tell these apart.

### The result: a feature vector

21 points × 3 numbers (x, y, z) = **63 numbers**. This list is called a
**feature vector**, and it describes the hand's shape. Recorded samples store
exactly these 63 numbers (rounded to 4 decimal places), not pictures.

---

## Step 3: k-Nearest Neighbors (classifier.js)

**Idea:** *You probably are the same letter as the recorded samples you look the most like.*

### Distance: how different are two hands?

We use the **Euclidean distance**, the same distance formula from geometry
class, just with more numbers:

- In 2D: distance = √( (x₁−x₂)² + (y₁−y₂)² )
- With 63 numbers: distance = √( (a₁−b₁)² + (a₂−b₂)² + … + (a₆₃−b₆₃)² )

Distance 0 = identical shapes. Bigger = more different.

### Worked example (2 numbers instead of 63, so you can draw it)

Recorded samples:

| Sample | Letter | Features |
|--------|--------|----------|
| 1 | A | (1, 1) |
| 2 | A | (1, 2) |
| 3 | B | (5, 5) |
| 4 | B | (6, 5) |
| 5 | B | (5, 6) |

Live hand: **(2, 2)**. Distances:

| Sample | Calculation | Distance |
|--------|-------------|----------|
| 1 (A) | √((2−1)² + (2−1)²) = √2 | **1.41** |
| 2 (A) | √((2−1)² + (2−2)²) = √1 | **1.00** |
| 3 (B) | √((2−5)² + (2−5)²) = √18 | 4.24 |
| 4 (B) | √((2−6)² + (2−5)²) = √25 | 5.00 |
| 5 (B) | √((2−5)² + (2−6)²) = √25 | 5.00 |

With **k = 3**, the three closest are sample 2 (A), sample 1 (A), and sample 3 (B).
Votes: A = 2, B = 1. **Answer: A**, confidence = 2 ÷ 3 = **67%**.

### Our settings

- **k = 5**: five neighbors vote. (An odd number makes ties less likely.)
- **Confidence** = winning votes ÷ 5. So 5/5 = 100%, 4/5 = 80%, 3/5 = 60%.
- A guess only "counts" if confidence is at least **60%** (3 of 5 agree).
  Below that, the app shows "?" ("Not sure...").
- **Tie-break:** if two letters get the same number of votes, the one with the
  single closest sample wins.

You can **watch k-NN work** in Free Sign mode: the "Nearest-neighbor votes"
row shows each neighbor's vote as a dot, like `B ●●●●  D ●`.

### Why k-NN?

- **No training step.** Record a new sample and it's used instantly.
- **Works with small data.** 30 samples per letter is enough to start.
- **Explainable.** "It found the 5 most similar samples and they voted."
- **Fast enough.** 24 letters × 50 samples = 1,200 distances per frame, which takes well under a millisecond.

**Weakness:** letters that look almost the same (M/N, A/S/T/E) have samples
that sit close together, so they get confused more. The accuracy test shows
which ones.

---

## Step 4: Smoothing (smoothing.js)

**Problem:** hands wobble. Frame by frame, the raw guesses might be:

```
B B B D B B B S B B B B ...
```

We don't want the letter flickering, and we don't want a "D" to count just
because one frame looked like D.

### Trick 1: Majority vote over the last 10 frames

Keep the last 10 guesses (about 1/3 of a second). The most common guess wins,
**but only if it has at least 60% of the votes** (6 of 10). That's the
**stable letter**.

| Last 10 guesses | Most common | Votes | Stable letter |
|-----------------|-------------|-------|---------------|
| B B B D B B B S B B | B | 8/10 | **B** |
| B D S D B ? D B S ? | D or B | 3/10 | **none** (too mixed) |
| (no hand) × 7, A × 3 | no hand | 7/10 | **none** |

Low-confidence guesses (below 60%) are counted as "not sure", so they can't
win the vote.

### Trick 2: Hold for 0.5 seconds to lock in

When a stable letter appears, a timer starts. If it stays the same letter for
**0.5 seconds**, it **locks in** (counts as your answer). If the stable letter
changes, the timer restarts.

The lock happens **once per hold**: holding "B" for 3 seconds is still one "B".
To sign B again, change your hand and come back.

**Double letters** (like the "OO" in BOOK): after a correct letter, if the
*next* letter is the same, the game clears the vote history so you can just
keep holding O and it locks in again.

**Get-ready pause:** when you pick a new letter in Learn mode or start the
Spell game, nothing can lock for 1.5 seconds. Otherwise the shape you were
*already* holding would instantly count as a wrong answer.

---

## Step 5: Finger hints (hints.js)

**Goal:** tell the learner *which* finger is wrong, like a tutor would.

### Measuring how bent a joint is

Take three points in a row along a finger: the joint before, the joint itself,
and the joint after. Make two arrows:

- arrow **u** = along the bone coming INTO the joint
- arrow **v** = along the bone going OUT of the joint

If the finger is straight, both arrows point the same way: **0°**.
If the finger bends into an L shape: **90°**.

The angle between two arrows comes from the **dot product** formula:

```
cos(angle) = (u · v) / (|u| × |v|)
where u · v = uₓvₓ + u_yv_y + u_zv_z  and |u| = length of u
```

**Example:** u = (1, 0, 0) and v = (0, 1, 0) (an L shape)
- u · v = 1·0 + 0·1 + 0·0 = 0
- |u| = 1, |v| = 1
- cos(angle) = 0 / 1 = 0 → angle = arccos(0) = **90°** ✓

### Bend of a whole finger

Each finger has 3 joints. We add up their bends:

| Finger | Roughly straight | Fully curled |
|--------|-----------------|--------------|
| index, middle, ring, pinky | ~0–30° | ~180–290° |

(The thumb is built differently, so its numbers are different, but bigger
still means more bent.)

### The template: the "average hand" for each letter

For each letter, we look at every recorded sample and compute its five finger
bends, then **average** them. That's the letter's template. We also average
the 21 points to get an "average hand", which Learn mode draws as the
**reference skeleton** (so no copyrighted pictures are needed).

### Choosing the hint

Compare your live bends with the target letter's template:

| Finger | You (making a **V**) | Template for **D** | Difference |
|--------|---------------------|-------------------|------------|
| thumb | 118° | 114° | +4° |
| index | 26° | 29° | −3° |
| **middle** | **21°** | **202°** | **−181°** ← biggest |
| ring | 186° | 244° | −58° |
| pinky | 191° | 248° | −57° |

- The finger with the **biggest difference** is the one to fix → **middle**.
- The difference is **negative** (you're bent *less* than you should be) →
  "**Curl** your middle finger more." Positive would mean "**Straighten** it."
- We stay quiet if the biggest difference is under **30°**, because small
  differences are normal between people.
- That finger is drawn **red** on both the live skeleton and the reference.

(These are real numbers from a test run, where the coach was shown a photo of a
"V" hand while the target letter was "D". It said: "Curl your middle finger more."
Your numbers will be a little different, because they come from your own samples.)

To stop the hint from jumping between fingers every frame, Learn mode uses a
**majority vote over the last 12 frames' hints**, the same trick as smoothing.

**Limitation:** bend angles don't capture *where the thumb is tucked* (M vs N
vs T) or *how far apart fingers are spread* (U vs V). If every finger's bend
is close but the letter is still wrong, the coach says: *"Your finger bends
look right. Check your thumb position and the angle of your hand."*

---

## The accuracy test (classifier.js → evaluateAccuracy)

How do we know the recognizer is any good? We test it on samples it
**hasn't seen**:

1. For each letter, hide the **newest 20%** of its samples (the "test set").
2. Use the other 80% (the "training set") as the k-NN samples.
3. Classify each hidden sample and check if the answer is right.

The report shows:
- **Overall accuracy**: correct ÷ total.
- **Per-letter accuracy**: which letters are weak.
- **Confusion matrix**: rows = the real letter, columns = the guess. Numbers
  on the diagonal (green) are correct; anything off the diagonal (red) is a
  mix-up, e.g. "M was mistaken for N 3 times".

**Why the newest 20%, not random?** Samples recorded back to back (a tenth of a
second apart) are nearly identical. If we picked test samples at random, almost
every test sample would have a "twin" in the training set, which is like
peeking at the answer key. Holding out the newest ones is more honest.

**Be careful:** the score is still optimistic if all of a letter's samples came
from one recording. For the most honest number, record a final round of samples
on a different day, or by a different person, before running the test.

---

## Progress tracking (progress.js)

Every time a letter locks in during **Learn** or **Spell-a-Word**, we save an
*attempt*: `{ letter, correct, mode, time }`. The Progress page groups these:

- **By letter:** correct ÷ total for each letter
- **By day:** correct ÷ total for each calendar day (to show improvement over time)
- **Recent days per letter:** accuracy on each of that letter's last 5 practice days

Up to 5,000 attempts are kept (the oldest are dropped first).

---

## How the handshape diagrams are drawn (handPoses.js → handModel.js → diagram.js)

The Alphabet, Record, Learn, and Spell screens show a picture of each
handshape. We didn't copy these from an ASL chart (that could break
copyright). Instead, the computer **builds a 3D puppet hand and draws it**.

### 1. A recipe for each letter (handPoses.js)

Each letter is described with a few numbers. For example, **V**:

```js
V: {
  view: [['y', 15]],                       // turn the hand 15° so you can see the thumb side
  fingers: {
    index:  { spread: -13, flex: [0, 0, 0] },    // straight, tilted 13° toward the thumb
    middle: { spread: 10,  flex: [0, 0, 0] },    // straight, tilted 10° toward the pinky
    ring:   { spread: 3,   flex: [88, 100, 65] },// curled into the palm
    pinky:  { spread: 6,   flex: [88, 100, 65] },
  },
  thumb: { ... },                          // holding down the ring and pinky
}
```

`flex` is the bend at each of the finger's 3 joints in degrees, the same
idea as the finger-bend angles the hints use.

### 2. Building the 3D hand (handModel.js)

- **Fingers:** start at the knuckle and walk along each bone. Each joint's
  bend **adds** to the ones before it, just like a real finger: if the knuckle
  bends 90°, everything after it already points 90° away. The direction of a
  bone bent by a total angle θ is `up × cos(θ) + palm-side × sin(θ)`, which is
  the unit circle from trig class.
- **Thumb reaching a fingertip (F, O, D):** this is *two-bone inverse
  kinematics*. We know where the thumb's knuckle is and where its tip must go.
  The two thumb bones and the line between those points make a triangle, so the
  **law of cosines** (c² = a² + b² − 2ab·cos C) tells us the angle at the knuckle,
  and therefore where the middle joint goes.
- **Turning the hand (G, H, P, Q, C, O, X):** we rotate every point with the
  standard rotation formulas, for example around the y axis:
  `x' = x·cos θ + z·sin θ`, `z' = −x·sin θ + z·cos θ`.

The result is 21 points in the **same order MediaPipe uses**, so the same
"which finger is which" code works for both.

### 3. Drawing it (diagram.js)

- We flatten 3D to 2D by keeping x and y. z (depth) is only used to decide
  **what's in front**.
- Each bone is drawn as a thick rounded line with a dark outline. The palm is a
  rounded shape.
- **Painter's algorithm:** sort all the shapes from farthest to closest, and
  draw them in that order. Closer shapes cover farther ones, like stacking paper.
  For a few letters where the exact depth is too close to call (S, M, N, T), the
  recipe says whether the thumb goes in front of or behind the fingers.
- Fingernails are drawn only when the nail faces the viewer, which helps you
  tell the back of the hand from the palm.
- Colors match the live skeleton (thumb yellow, index green, middle blue,
  ring purple, pinky teal), and the finger a hint is about turns **red**.

**Important:** the recipes are our best approximation of each handshape. Check
them against a trusted ASL resource or a fluent signer, and adjust the numbers in
`handPoses.js` if a picture looks off. The unit tests in `tests/handModel.test.js`
will tell you if a change breaks something (for example, if the thumb in F no
longer touches the index finger).
