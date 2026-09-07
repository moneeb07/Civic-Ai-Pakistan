# Image assets

## pakistan-flag-hero.webp — the landing hero flag

A photoreal silk render of the flag, generated with ChatGPT and supplied by the
project owner, so it is the project's own asset with no third-party licence
attached.

Processed from the 1536x1024 original by `scripts/`-free one-off steps that are
worth recording, because the naive version of each is wrong:

1. **Background removed by connectivity, not by colour.** A quarter of this flag
   IS white — the hoist band — so "make white transparent" would have deleted
   it. The backdrop is instead flood-filled inward from the image border.
2. **The contact shadow was sealed first.** That shadow is what separates cloth
   from backdrop, but it has near-white gaps a pixel or two wide, and the fill
   escaped through them into the hoist band. A binary closing with a 25px
   kernel welds those gaps into a continuous wall before any filling happens.
3. **Cropped to the cloth** (two thirds of the original frame was empty), then
   resized to 1100px wide — twice the largest size the hero ever paints it at —
   and saved as WebP. 34KB.

The hero relies on measured geometry: in this asset the star occupies
0.83–0.93 of the width and the crescent 0.60–0.93. If the asset is ever
regenerated, re-measure, because the hero positions the cloth so both land
inside the visible column.

## pakistan-flag.svg — the flat flag

Official construction-sheet geometry from Wikimedia Commons
(<https://commons.wikimedia.org/wiki/File:Flag_of_Pakistan.svg>), **public
domain** — a national flag's design is not copyrightable. Downloaded
unmodified: the specified `#01411C` green, the crescent cut by a circle offset
and rotated -41.63°, the star at that rotation plus 18°.

Not used by the hero any more (the render above replaced it). Kept as the
canonical flat flag for anywhere that needs one — share images, a language
switcher, print.

## The landmark band

Not a file. It is drawn as vector paths in
`src/components/landing/pakistan-scene.tsx`: Mazar-e-Quaid, Minar-e-Pakistan,
Badshahi Mosque, the Pakistan Monument, Alamgiri Gate, Bab-e-Khyber and the
modern city, with a mirrored reflection.

The composition follows a stock silhouette the client liked, but none of that
image is used: it carried a visible watermark, and shipping it would have put
unlicensed artwork into production. Drawn, it is also weightless, stays sharp
at 3x, and takes its colour from the page (`--color-flag`).

**No third-party photographs are used anywhere in the UI.**

## cnic-front.webp / cnic-back.webp — the specimen card

The two faces of a Pakistani Smart NIC, shown on the identity step so a citizen
can see which side is being asked for.

**This is a NADRA specimen, not a real citizen's card.** The same card appears
in NADRA's own annotated diagram of the Smart NIC with identical data — name
"Neelam Iqbal", number 78554-6822419-8, dates, and serial 109001000889 — and
with "No Photo" printed in the picture slot, which is what confirms the record
is specimen data rather than a person's. The UI labels it as a specimen where
it is shown.

Split out of a single supplied JPEG of both sides on a cloth backdrop: each
card cropped, inset by 9px to shed the last sliver of that backdrop, then
masked to the ID-1 corner radius (3.18mm — about 6% of card height) so it drops
onto the tinted panel without a rectangle of cloth around it. 880px wide.

Replaced at runtime by the citizen's own photograph as each side is captured.
