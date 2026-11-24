# How Signly Works

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
 2. Normalize                  ──►  21 points: wrist at 0, palm size 1, left hands mirrored
     │                               (landmarks.js)
     ▼
 2b. Describe                  ──►  86 numbers: shape, direction, bends, thumb, crossing
     │                               (features.js)
     ▼
 3. k-Nearest Neighbors        ──►  "B, 80% confident"  (compared with ~6,000 REAL signers' hands)
     │                               (classifier.js + data/reference-hands.json)
     ▼
 4. Smoothing                  ──►  "B is steady... held 0.5 s... LOCKED IN!"
     │                               (smoothing.js)
     ▼
 5. Finger hints (Learn mode)  ──►  "Curl your index finger more." (index drawn red)
                                     (hints.js)
```

We did **not** train a neural network. MediaPipe (made by Google) finds the
hand points. Everything after that is math we wrote ourselves.

**Where the "correct answers" come from:** the coach compares you with about
6,000 hands of **real people signing**, taken from two public research datasets
(see "The real-signer answer key" below). Because it doesn't use your own
recordings as the answer key, it can't learn a wrong handshape from you.

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

### The result: 63 numbers

21 points × 3 numbers (x, y, z) = **63 numbers**. Saved samples store exactly
these 63 numbers, not pictures.

---

## Step 2b: Describing the hand (features.js)

Real people hold their hands at slightly different angles. If your whole hand
is tilted 20°, all 63 numbers change, even though your handshape didn't. So
before comparing, we turn the 63 numbers into an **86-number description** (the
*feature vector*) made of five parts:

| Part | Numbers | What it captures | Why |
|------|---------|------------------|-----|
| **Shape** | 63 | Every point measured from the **palm's own point of view**: "how far across the palm, up the palm, and out of the palm" | Tilting your whole hand doesn't change these |
| **Direction** | 6 | Which way the fingers point and the palm faces | H vs U, P vs K, and G vs Q have the same shape but point different ways |
| **Bends** | 5 | How curled each finger is (from hints.js), ÷ 100 | Easy-to-compare summary of each finger |
| **Thumb** | 10 | Distance from the thumb tip to other finger joints | A, S, T, M, N, E differ mostly by where the thumb is |
| **Crossing** | 2 | Is the index tip on the "wrong side" of the middle tip? | R (crossed) vs U (side by side) |

**"From the palm's point of view"** uses the dot product: we build three
directions attached to the palm (*across* = pinky knuckle → index knuckle,
*up* = toward the fingers, *facing* = straight out of the palm, found with the
**cross product**), and for each point we ask "how far along each direction?"
That's `dot(point, direction)`, the same math as projecting onto an axis.

**How we chose this design:** we tested each idea on people the coach had
**never seen** (see the fair accuracy test below). Plain coordinates: 69%. Palm
point of view + direction: 74%. Adding bends, thumb distances, and crossing: **77%**.

---

## Step 3: k-Nearest Neighbors (classifier.js)

(The examples below use 2 numbers to keep the math small. The real coach does
exactly the same thing with the 86-number feature vectors.)

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
- **Explainable.** "It found the 5 most similar real signers' hands and they voted."
- **Fast enough.** About 6,000 distances (86 numbers each) per frame takes a few milliseconds.

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

For each letter, we take the real signers' hands (plus any teacher-added
samples), compute each one's five finger bends, and **average** them. That's
the letter's template. We also average the 21 points to get an "average hand",
which Learn mode draws as the small **"average of real signers"** skeleton.

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

## The real-signer answer key (data/reference-hands.json)

We used two public datasets of photos of people fingerspelling (both CC BY 4.0;
credits in `data/ATTRIBUTION.md`). We ran the same MediaPipe the app uses on
about 9,000 of the photos, kept the 21 hand points of each hand it found,
normalized them exactly like the app does, and kept at most 50 per letter per
person so nobody dominates. Result: **6,036 hands, about 250 per letter, from at
least 4 different people**. The answer key stores only numbers. `tools/README.md`
shows every step.

### The letter photos (images/letters/, js/letterPhotos.js)

Next to each diagram the app shows two **real photos** from the first dataset,
from two different people. Which photo? For each person we picked the most
**typical** one: the photo whose hand is closest (smallest k-NN distance, on
average) to every *other* person's hands for that letter. That avoids showing
someone's unusual version of a letter (`tools/rank-photos.mjs`).

Some people in the photos signed with their left hand or were photographed
from the other side, so a few photos are **mirrored** to match the right-hand
diagrams. MediaPipe's "Left"/"Right" label was often wrong on tightly cropped
photos, so instead we compared each photo's 21 points with the diagram's 21
points, as-is and flipped, after turning them to the best-matching angle
(a "Procrustes" fit), and kept whichever matched better (`tools/orient-photos.mjs`).

The dataset's photos are 300 × 300, but most are really a narrower photo with
white bars added. `tools/crop-photos.mjs` finds the real photo inside the bars
(ffmpeg's `cropdetect` finds black borders, so we run it on the photo's
*negative*, where white turns black), and fits it into a square whose empty
edges are filled with a blurred copy of the same photo. Now every photo is the
same size and shape, so they line up neatly side by side.

## The fair accuracy test: "leave one person out" (classifier.js → evaluateUnseenPeople)

How well does the coach work for a **brand-new person**? We can't just test on
random samples, because a person's own samples look almost identical to each
other, which would be like peeking at the answer key. Instead:

1. Pick one person. Hide **all** of their hands.
2. Recognize each hidden hand using **only the other people's** hands.
3. Repeat for every person, and add up the score.

Result: **76% overall** (54%–88% depending on the person). The report shows:
- **Accuracy for each hidden person**
- **Per-letter accuracy**: the hardest are P, X, R, and D
- **Confusion matrix**: rows = the real letter, columns = the guess. Green
  (diagonal) is correct; red is a mix-up, e.g. "R was mistaken for U 12 times"

The mix-ups are the same letters people mix up: R/U, M/N, A/S/T/E, P/Q/X, C/O.
The biggest way to improve would be more signers in the answer key.

## Keep learning, safely (learning.js)

The coach can get used to **your** hand, lighting, and camera. But a coach that
learns from its student could learn the student's mistakes, so it only saves a
sign when **all three** are true:

1. You were asked for a letter (in Learn or Spell-a-Word),
2. the coach locked in that same letter, and
3. the **real signers alone** (nothing previously learned from you) agree
   strongly: at least **4 of the 5** nearest neighbors.

Rule 3 is the safety lock. A sign can only be learned if it already looks like
the real signers' version, so learning just makes the coach recognize your
*correct* signing more reliably. Learned samples are capped at 30 per letter
(the real signers always outnumber them), are never used for the templates
or finger hints, and can be erased with one button. You can switch learning off
on the Test & Data screen.

**Teachers can add examples too:** on the *Add Samples* screen, a fluent signer
can record extra correct examples. These are trusted, so only a fluent signer
should use that screen.

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
- **Depth shading:** parts that are farther away are mixed with a little gray
  (up to 22%), so you can see which fingers are in front.
- **Finger name tags** (`placeFingerLabels`): each finger gets a tag at the
  part that sticks out the most from the middle of the palm (the tip of a
  straight finger, the knuckle of a curled one). The tag goes **outside the box
  around the hand**, on the nearest side but never the forearm's side, with a
  dotted line back to the finger. Tags that overlap are pushed apart a little at
  a time (and kept outside the box) until none touch. A unit test checks every
  letter, both hands: 5 tags, no overlaps, none covering the hand.
- **Drag to turn:** in Learn and Spell you can drag the diagram to look at the
  hand from other sides. Dragging adds two extra rotations (left-right and
  up-down) after the recipe's own view; double-click resets.

### 4. Checking the diagrams against real signers (tools/fit-diagrams.mjs)

A drawing can look nice and still be wrong, so we compared every diagram with
the average of the real signers:

- **Finger bends:** the first version drew fists much tighter than real people
  make them (253° vs. about 205°) and over-bent the thumb. We loosened them.
- **Thumb position:** for most letters, a program tried thousands of thumb-tip
  spots and kept the one whose distances to the fingertips and knuckles best
  match the real signers. For M, N, and T the thumb is hidden under the
  fingers, so MediaPipe has to guess where it is; those follow the ASL definition.
- **Direction:** the real data showed X is turned the same way as C. P was
  redrawn after comparing with photos of real signers: it's the K handshape with
  the whole hand **pointing toward the camera**, so from the front the **index
  points up and the middle finger points down**, about 90° apart, with the thumb
  touching the middle finger between them.
- **Final check:** the coach (trained on real signers) recognizes **21 of the
  24 drawings** as the right letter. The 3 it misses are N, S, and T: the same
  fist letters it mixes up for real people.
- **J and Z** get a diagram of their starting handshape plus a **bold arrow**
  (an SVG "path") showing the movement: a dot marks where the fingertip starts,
  a white edge keeps the arrow visible on top of the hand, and the J hook is a
  smooth curve (a "cubic Bézier"). The coach can't check them yet.

`tests/diagram-accuracy.test.js` re-checks this every time the tests run, so a
change that makes a diagram drift away from real signing will fail.
**Still recommended:** have an ASL teacher look at the diagrams too.

---

## Practice sets (drill.js)

Going through the alphabet in order is good for a first pass, but learners
mostly need **more repetitions of the letters they get wrong**. A practice set:

1. You choose letters (or a quick pick like "M · N" or "my weakest letters",
   which comes from `lettersToPractice` in progress.js) and how many times each.
2. `buildDrillQueue` makes the list. "Mix up the order" shuffles the letters
   **one round at a time** (every letter once per round), and if a round would
   start with the letter the last round ended on, it swaps the first two. So you
   never sign the same letter twice in a row, which forces you to really switch
   handshapes (that's what builds memory, not holding one shape).
3. A letter only moves on after a **correct** sign; wrong signs count as extra tries.
4. At the end, `summarizeDrill` shows tries per letter, and "Practice just the
   tricky ones" starts a new set with only the letters that took extra tries.

## Reading quiz (quiz.js)

Fingerspelling has two halves: **signing** and **reading**. The quiz shows a
real photo (or a diagram) and 4 letters. `makeQuestion` picks up to 2 wrong
choices from the answer's look-alike group (for example N for M), then fills the
rest randomly, so the quiz practices exactly the differences people confuse.

## Fact-checking the written instructions (letters.js)

Each letter's instructions are 2–3 short steps: the handshape, where the thumb
goes, and which way the palm faces. "Toward your other hand" is used instead of
"left" or "right", so the same words work for right- and left-handed signers.

We compared every letter with Lifeprint / ASL University, Signing Savvy's
"Common fingerspelling mistakes", and Wikipedia's "American manual alphabet".
What changed:

- **R:** the middle finger crosses **behind** the index finger. Our diagram had
  it in front, so we redrew it. We also checked the real signers' data: in R
  the index fingertip is measured closer to the camera than in U (where the
  fingers aren't crossed), which agrees.
- **M / N / T:** the thumb tip peeks out between ring and pinky (M), middle and
  ring (N), or index and middle (T). M and N fingers drape over the thumb
  instead of squeezing into a tight fist.
- **G / H:** the palm faces **you**, fingers pointing sideways.
- **C / O:** the palm faces mostly forward, turned only a little to the side.
- **E:** the fingertips rest on the thumb (a big gap is a common mistake).
- **P:** the K handshape with the wrist bent, so the middle finger points down;
  "the change from K to P is all wrist."
- **J / Z:** left-handed signers draw them as a mirror image (the Left switch
  flips the arrows too).

