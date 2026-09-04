# To Buy or Not to Buy

A phone-camera barcode scanner for DVD/Blu-ray/4K cases, built for bargain-hunting in charity/second-hand shops (CeX and similar). Scan the barcode on the back of a case and it tells you **BUY** or **DON'T BUY** based on the movie's ratings.

Styled in CeX's own brand colours (red `#E20A03` / black / white), taken from webuy.com.

## How it works

1. Point your phone camera at the barcode. A live reticle with autofocus, torch and zoom controls helps with focus in bad lighting.
2. The barcode is looked up against [UPCitemdb](https://www.upcitemdb.com/)'s free trial API (100 lookups/day, via a public CORS proxy) to get the product title.
3. The cleaned-up title is queried against [OMDb](https://www.omdbapi.com/) for the Rotten Tomatoes **Tomatometer** (critic score) and IMDb rating.
4. A verdict is shown using thresholds you can tune in Settings (⚙ top right).

## Important limitation: no real "Audience Score"

Rotten Tomatoes has no public API, and scraping their site breaks their Terms of Service — so this app does **not** show RT's actual Popcornmeter/Audience Score. Instead it shows:

- **Tomatometer** (critics) — via OMDb, when RT has one on file for that title.
- **IMDb rating** — used as an audience-opinion stand-in when no Tomatometer score exists.

## One-time setup (do this once, on your phone or PC)

1. Open the site.
2. Tap the ⚙ settings icon.
3. Get a free OMDb API key at **https://www.omdbapi.com/apikey.aspx** (choose the free 1,000 requests/day tier) — they email you the key, click the confirmation link.
4. Paste the key into Settings and save. It's stored only in your browser (localStorage), never sent anywhere except OMDb's API.

## If the camera won't focus on the barcode

- Tap the reticle box on screen — it nudges the camera to refocus.
- Use the 🔦 Torch button in low light.
- Use ➕ Zoom if the barcode is small or far away.
- Hold the case steady ~10–15cm away, fill the red box with the barcode.
- If it still won't scan, type the barcode digits into the manual entry box below the camera.

## Tech notes

- Plain HTML/CSS/JS, no build step — deployed as a static site via GitHub Pages.
- Barcode scanning: [html5-qrcode](https://github.com/mebjas/html5-qrcode), restricted to EAN-13/EAN-8/UPC-A/UPC-E/Code128 formats.
- UPCitemdb's trial endpoint blocks browser CORS requests, so lookups go through the public `api.allorigins.win` proxy. This is a free, unauthenticated proxy with no uptime guarantee — if barcode lookups start failing, that proxy may be down or rate-limited.
- Camera access requires a secure context (HTTPS or localhost), which GitHub Pages provides automatically.
