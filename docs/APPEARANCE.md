# Appearance update

The header's moon button turns night mode on or off. Night mode replaces the stage and decorative background dots with a near-black navy gradient and very faint violet/blue glows, without changing panel colors, sound settings, typed answers, score selections, or the round timer. It is remembered on this browser/device; it does not change other contestants' screens.

The upper-left house returns to the homepage. The footer contains a compact wordmark based on the existing share image and retains the unofficial-game disclaimer.

Lifetime player cards retain every statistic, ranking, and account classification. Their content is compact on mobile and scrolls within the available viewport when needed. Close stays in a separate bottom row. Keyboard users can tab between the statistics and Close, scroll the statistics with arrow keys, or press Escape. Focus returns to the button that opened the card when that button is still on the page.

These changes require no Firebase rules, data migration, or Worker deployment.

## Footer artwork

- Final asset: `assets/footer-wordmark.webp` (780 × 323 pixels, approximately 16 KB).
- Reference: `assets/social-share.jpg`; the original sharing image is unchanged.
- Mode: built-in image generation/editing tool, not the CLI/API fallback.
- Delivery: the original WebP lettering is preserved. The footer renders it inside SVG with an explicit alpha cutout, not CSS screen blending. Black and near-black background pixels become transparent before compositing, while the bright blue, white, and gold lettering remains opaque. This works independently of ancestor stacking contexts. The footer crops only empty vertical padding.
- The source WebP itself remains opaque; transparency is produced by the SVG in `legalFooter()` in `src/app.js`. Its sRGB alpha is `clamp(2R + 2G + 2B - 0.15, 0, 1)`, using normalized color values. The small threshold also suppresses near-black compression fringes. RGB lettering values are unchanged.
- A further built-in transparency-edit attempt returned another opaque checkerboard image and was rejected. It is not used in the website; the rendering correction preserves the original lettering exactly.

Initial extraction prompt:

```text
Use case: background-extraction
Asset type: transparent footer wordmark for the user's existing Google Feud family game website.
Input image 1: EDIT TARGET, the existing social-share artwork.
Primary request: isolate ONLY the large single-line lettering "GOOGLE FEUD" from the attached image. Remove the complete stage background, confetti, question-mark medallion, blue plaque, surrounding gold border, spotlights, and all other elements.
Preserve the existing lettering very faithfully: same exact blocky rounded capital letters, white-to-ice-blue GOOGLE with cyan/dark-blue bevel and extrusion, and golden-yellow FEUD with warm amber 3D shading. Keep the original proportions, perspective, layout, and letter spacing. Do not redesign or retype in a different font.
Text (verbatim): "GOOGLE FEUD". Spelling F E U D.
Composition: all the words in one uninterrupted horizontal line, not stacked, centered in a wide image, with a small clear transparent margin around the letter outlines and their own short 3D shadow. No clipping.
Background: genuine alpha-channel transparency, including the holes inside letters. Absolutely no white rectangle, black rectangle, checkerboard illustration, or background glow field. The output is only the cutout letters and their dimensional outlines, suitable for placing on any dark website background.
No added text, no symbols, no question mark, no plaque, no watermark.
```

Final correction prompt (the first output painted a checkerboard instead of transparency):

```text
Use case: background-extraction.
Input image 1 is the edit target: the isolated GOOGLE FEUD wordmark.
Correct ONLY the background. Replace every light checkerboard square and all blank backdrop with perfectly uniform pure black RGB(0,0,0), including the spaces between letters and the holes in letters. Keep the exact white/ice-blue GOOGLE and yellow/gold FEUD letter faces, cyan/blue/gold bevels, their 3D dimensional edges, relative sizes, and one-line horizontal arrangement completely unchanged. Do not add a plaque, emblem, light rays, reflections, confetti, extra words, or borders.
This will be a small footer wordmark, composited by the website against dark backgrounds. Require an absolutely pure #000000 flat matte, not a gradient or texture, not a checkerboard, not gray, not white. The letters should fill almost all the width of a tightly framed very wide strip with only 20px black safety padding around the outer letter extents; minimal vertical empty space.
Exact text: GOOGLE FEUD. Spelling F E U D. No other text.
```

## Checks

Run `node --test tests/*.test.mjs` for the game and appearance regression tests. The UI tests exercise the actual application functions using an isolated DOM stub, without Firebase writes or test accounts.

For a phone check, toggle night mode while typing a round answer, reload to check the saved preference, and open a player card in portrait and landscape. Confirm that Close stays visible, the statistics scroll if necessary, and the nickname, sound, moon, refresh, and menu controls remain reachable.
