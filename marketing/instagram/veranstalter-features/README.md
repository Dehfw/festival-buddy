# Instagram-Post: Veranstalter-Features

Motiv (1080×1350, Instagram-Feed 4:5) im DEFƎKT-Look, das die
Veranstalter-Features aus `/fuer-veranstalter` bewirbt.

- `post.png` – fertiges Motiv zum Hochladen
- `post.html` – Quelldatei des Motivs (Farben/Typo aus
  `src/app/globals.css` übernommen)
- `caption.md` – Post-Text, Hashtags und Alt-Text
- `anton-latin.woff2` – Marken-Schrift Anton (Latin-Subset),
  © The Anton Project Authors, [SIL Open Font License 1.1](https://openfontlicense.org)

## Neu rendern

Nach Änderungen an `post.html` (Chromium schneidet bei exakt passendem
Viewport die unterste Kachel ab, daher höher rendern und zuschneiden):

```bash
cd marketing/instagram/veranstalter-features
chromium --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --force-device-scale-factor=1 --virtual-time-budget=4000 \
  --window-size=1080,1400 --screenshot=full.png "file://$PWD/post.html"
python3 -c "from PIL import Image; Image.open('full.png').crop((0,0,1080,1350)).save('post.png')"
rm full.png
```
