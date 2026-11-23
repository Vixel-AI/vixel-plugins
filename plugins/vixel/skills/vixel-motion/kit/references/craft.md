# Motion craft

Defaults that make code animation read as designed rather than generated. A
reference the creator gave, or a shot that breaks one on purpose, wins.

## The brief comes first

- One idea the viewer can repeat afterwards. If it does not fit in one
  sentence, cut scope until it does.
- Words first: write and time the narration or the on-screen lines before any
  scene. Narration runs about 2.2-2.5 words a second in English and 4-5
  characters a second in Mandarin; a scene holds about 19 spoken words.
- Turn every adjective into a number in `STORYBOARD.md`: "playful" is springs
  at damping 0.45-0.6 and 10-30% exaggerated poses; "clean" is a grid, margins
  and one accent per shot; "bold" is a display size and an outline width.

## Kinds of video

**Explainer or fact card (知识大赏).** Start where the viewer already is: a
question they would ask about something they know ("why is this dad
pregnant?"). One worked example or one object carries the answer; add one part
per beat, each appearing when it is named, never a finished diagram dropped on
screen. The host character reacts to each fact (a take: anticipation, squash,
new face, settle). End on the one idea in one line. Tells: bullet slides,
icons in circles, three cards in a row, the narrator reading the screen word
for word.

**Kinetic typography.** 3-7 English words or 4-12 Chinese characters per scene.
Vary the entrance within a film: word by word from a 6 px blur in 0.13 s, 0.067 s
apart; the whole line blurring in over 0.13-0.2 s; letters 0.1 s apart for a
name; one word rolling through options like a slot machine. A landed title is
dead still; the motion moves to the next element or the world behind. One
highlighted word in the accent colour, and it carries the meaning.

**Numbers and charts.** One number at a time, earned by the scene before it,
and the biggest thing on screen. Tabular figures so a count does not jitter; a
count runs 1.2-1.6 s, then lands as a hit (an instant `tl.set`, then a settle)
and holds. Build a chart in reading order: frame and axis, a reference line,
the data drawing in, one annotation on the point that matters. Highlight one
series and grey the rest. Real numbers only, rounded the same way everywhere,
with a small source line. Tells: KPI-card grids, pie charts, every number
counting at once, numbers with no source.

## Motion

- **Eases by role.** Arrivals land on a long tail (`expo.out`, `power4.out`);
  camera moves and colour floods ease both ways (`power2.inOut`); a zoom
  through or an exit accelerates (`power3.in`). The same `power2.out` at 0.5 s
  on everything is the generated look. Linear only for rotation and progress.
- **Springs by damping.** 0.7-0.85 reads premium, 0.4-0.6 playful, under 0.3
  a cartoon; `elastic.out(1, 0.55)` and `back.out(2)` are close. Position and
  scale may bounce; opacity and colour never do.
- **Characters act.** Offset the parts and the timing (body leads, the cutout
  squashes on landing with its origin at the feet); a shake is fixed
  keyframes, not random numbers. A character's idle and overshoot are acting;
  breathing or floating loops on titles and UI are not.
- **Timing.** Exits are 40-50% shorter than entrances. The next element starts
  when the previous one is 30-50% done. Stagger words 60-120 ms, list items
  40-80 ms. Hold 0.3-0.75 s before a payoff.
- **Holds.** A line the viewer must read stays 0.5 s plus 0.3 s a word; the
  film's last line at least 2 s. Something new every 2-4 s across the film; a
  stretch of 3 s with nothing changing is dead.

## Transitions with a cause

Use three to five kinds in a film, each caused by something on screen:

| Transition | How |
| --- | --- |
| Object becomes the world | a shape on screen (the belly, a card) grows past the frame in 0.35-0.65 s and its colour is the next scene's ground, which shrinks into the next card |
| Colour flood | the hero stays while the ground changes colour in about 0.4 s, `power2.inOut` |
| Whip | a 0.13-0.3 s horizontal smear; the arriving element lands blurred and sharpens in 0.13 s |
| Iris | `clip-path: circle()` opens from a point that matters in about 0.15-0.4 s |
| Blur swap on one stage | out: opacity to 0 with an 8 px blur in 0.13-0.2 s; in: blur to 0 in 0.13 s |

At most a third of the seams between scenes are plain cuts.

## Vertical layout (1080x1920)

- Every word stays between 288 and 1248 px down and 120 and 888 px across; the
  apps draw their own interface outside it. Characters and plates may extend
  past it and past the frame.
- Frame 0 is the thumbnail: the hook line or the result is on screen within
  the first third of a second. Never black, never a logo.
- Nothing meant to be read under 28 px; titles at 4-9% of the frame height
  (about 80-170 px), with a dark outline over busy plates
  (`paint-order: stroke fill; -webkit-text-stroke`).
- One subject, centred, stacked vertically; landscape layouts are rebuilt as a
  vertical sequence, never squeezed.

## Banned by default

A dark navy void with small things floating in it; glow, bloom, lens flares,
particles as decoration; purple or blue gradients and glass cards; pill chips
and small monospace caps labels; everything centred and fading up at once;
text that moves while it is read; titles that keep drifting after they land;
corner brackets and HUD decoration.
