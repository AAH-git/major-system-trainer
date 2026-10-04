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

## 4. Publish

Commit and push to GitHub. On GitHub, go to **Settings → Pages → Build and deployment**, set Source to *Deploy from a branch* and choose `main` / `(root)`.
After a minute the site is live at `https://<your-username>.github.io/<repo-name>/`.

Tip: on iPhone or iPad, open the site in Safari and use Share → *Add to Home Screen* to open it like an app.

> The repository and its images are public: anyone with the URL can see them.
