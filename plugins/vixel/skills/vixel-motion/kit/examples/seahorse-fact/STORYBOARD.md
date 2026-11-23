# Seahorse fact: storyboard

A finished 8-second fact card made from pictures already accepted in a Vixel
Work (the animal-facts seahorse episode), so it cost no new credits. Copy this
file's shape for a new video.

```text
GOAL:    the viewer learns that seahorse dads give birth, and to how many babies
OUTPUT:  HyperFrames, 1080 x 1920, 30 fps
TIME:    8 s x 30 fps = 240 frames; silent test card (a full episode adds narration)
LOOK:    ground = the Work's flat 2D cartoon plates; paper #fff7e8; ink #2b1a0e as
         outlines (16 px on titles, 18 px on the number); accent #ff7a1a, the dad's
         orange, only on the payoff word, the flood and the card;
         Nunito Black: kicker 50 px, title 116 px, number 236 px tabular, labels 56-64 px
OBJECTS: the dad (Vixel cutouts: shocked, proud); a reef and a kelp home (Vixel plates);
         eggs = code-drawn orange circles with an ink rim, one per 40 babies
MOTION:  arrivals expo.out / back.out; the dad on elastic.out(1, 0.55) with a squash
         on landing (origin at his tail); exits power2.in, 40% shorter; the flood
         power3.in; the count power2.out over 1.4 s, then a hit and a settle
BANNED:  dark void, glow, glass cards, pill chips, everything fading up at once,
         text that moves while it is read
```

## Shots

| Time | Scene | Hero move | Viewer reads | Hands off |
| --- | --- | --- | --- | --- |
| 0.0-4.0 | `hook` on the reef plate | the shocked dad springs up from below and lands with a squash; a starburst behind him; a shake at 2.1 s | "Seahorse fact" / "This dad is pregnant." (the first words on screen by 0.35 s; "pregnant." lands by 0.65 s, bigger, in the accent) | at 3.6 s his belly floods the frame orange |
| 4.0-8.0 | `count` on the kelp plate | the flood shrinks into the card; 0 to 2,000; 50 eggs fill in step; the proud dad springs in | "Dad gives birth to up to 2,000 babies at once", "1 egg = 40 babies" | the last lines hold 2 s |

## Pictures

| File in `assets/` | From the Work | Made by |
| --- | --- | --- |
| `dad_shocked.png` | Shot "Why is this dad pregnant" opening image (original output) | `prep.py cutout ... --names dad_shocked` |
| `dad_proud.png` | Shot "Dads carry the babies" opening image (original output) | `prep.py cutout ... --names dad_proud` |
| `bg_reef.jpg` | Location "Sunny coral reef" look | `prep.py plate src/bg_reef.png` |
| `bg_kelp.jpg` | Location "Cozy kelp home" look | `prep.py plate src/bg_kelp.png` |
| `fonts/Nunito-Black.ttf` | `KIT/fonts` | copied |

## Facts

- Male seahorses carry the eggs in a brood pouch and give birth to the young.
- A brood can number up to about 2,000, depending on the species; the card says
  "up to".

## Review notes

- `HF check`: no errors. Kept on purpose: both dad cutouts leave the frame at the
  bottom and enter from off frame (`data-layout-allow-overflow`).
- First pass fixed from the beat sheet: the title words started at 0.3 s, so the
  first frames showed only the plate (they now start at 0.0); the last line held
  1.8 s (now 2.15 s).
- Weakest stretch: 5.5-8.0 s holds the finished card with only the slow pull-back;
  a narrated episode would put the next fact there.
