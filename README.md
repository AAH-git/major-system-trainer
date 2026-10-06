# Major System Trainer

A small web app for practising your personal Major System images (0–9 and 00–99).
It's plain HTML, CSS and JavaScript, hosted on GitHub Pages, and works in any browser on desktop, iPad or phone.

## 1. Add your images

Put all 110 images in the `images/` folder. **The file name tells the app which number the image belongs to:**

```
<number>-<word>.<ext>
```

| File name         | Number | Word shown |
|-------------------|--------|------------|
| `00-sauce.jpg`    | 00     | sauce      |
| `07-sock.png`     | 07     | sock       |
| `7-key.jpg`       | 7      | key        |
| `12-tin_can.webp` | 12     | tin can    |
| `42.jpg`          | 42     | (no word)  |

- `0`–`9` and `00`–`09` are **different** numbers. Keep the leading zero on the two-digit ones.
- In the word, `_` and `-` are shown as spaces. Accents are fine (`26-niño.jpg`).
- Allowed formats: jpg, jpeg, png, webp and gif.
- Keep each image under about 500 KB (about 800 px wide is plenty) so it loads quickly on a phone.

## 2. Build the manifest

A website can't list the files in a folder, so a script writes `manifest.js`, which lists every image with its number and word.

Double-click **`tools\build-manifest.bat`**, or run this from the project folder:

```bash
powershell -ExecutionPolicy Bypass -File tools\build-manifest.ps1
```

The script reports any missing numbers, duplicates, badly named files and very large images.
**Re-run it every time you add, remove or rename an image.**

## 3. Try it locally

Open `index.html` in your browser by double-clicking it.

## Performance stats

Every "I know" / "I don't know" answer is saved in the browser's own storage (`localStorage`), not on a server.
Number questions and image questions are counted separately.

- Stats are kept separately on each device and in each browser. On iPhone or iPad, a home-screen icon also has its own stats, separate from Safari.
- Clearing the browser's site data or cache resets them, and so does the **Reset stats** button.
- Safari on iPhone and iPad may clear a site's saved data if you don't open it for about 7 days. A site added to the home screen is not affected.

## Spaced repetition

Rounds are picked by [FSRS-6](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm), the scheduler Anki uses by default. It runs entirely in [srs.js](srs.js) and works out when each of the 220 cards (110 numbers × asked both ways) should come back so you recall it about 90% of the time.

- **"I know" counts as Good and "I don't know" counts as Again.** A missed card comes back after 10 minutes. A known card comes back after an interval that grows each time you remember it, capped at 60 days.
- **Each round of 10 is filled in this order:**
  1. one *check-up* slot for the memorised card (stability ≥ 21 days) checked longest ago
  2. cards that are due, the ones you're most likely to have forgotten first
  3. cards you haven't practised yet, your weakest Performance % first
  4. if there's still room, cards that aren't due yet but are the least secure
- **No two cards for the same number** are ever in one round.
- **Personalisation:** every answer goes into a review log. From 50 answers the app fits your starting memory strength. From 400 it fits all the parameters that pass/fail answers can inform, and keeps the new ones only if they predict your most recent answers better. This runs automatically as the log grows, or when you press **Re-optimise now** on the Performance screen.
- **Stored in the browser:** the schedule and log live in `localStorage` alongside the stats, and **Reset stats** clears them all.

Run the scheduler tests with:

```bash
node tools/srs-test.js
```

## 4. Publish

Commit and push to GitHub. On GitHub, go to **Settings → Pages → Build and deployment**, set Source to *Deploy from a branch* and choose `main` / `(root)`.
After a minute the site is live at `https://<your-username>.github.io/<repo-name>/`.

Tip: on iPhone or iPad, open the site in Safari and use Share → *Add to Home Screen* to open it like an app.

> The repository and its images are public: anyone with the URL can see them.
