# OT Tracker

A Progressive Web App (PWA) for logging overtime and estimating OT pay using Malaysia Employment Act 1955 rates. Works offline and can be installed on your phone's home screen. All data stays on your device.

## Features

- **Log OT:** date, start and end time, total hours (calculated automatically, overnight shifts supported), description.
- **Day type detected automatically:** Normal Day, Off Day (Saturday), Rest Day (Sunday) or Public Holiday (Selangor). You can override it for each entry.
- **Pay estimate:** shown live while you fill in an entry, plus monthly totals and a breakdown by day type.
- **Monthly limit:** progress bar towards the 104 h monthly OT limit.
- **Salary cut-off date:** optionally group OT by pay period instead of calendar month (e.g. cut-off 20th: "November" = 21 Oct – 20 Nov). Set it in Settings.
- **Public holiday list:** Selangor 2026–2027 built in; add, remove or edit dates (e.g. cuti peristiwa).
- **Export and backup:** CSV export per month or for all entries, JSON backup and restore.
- **Configurable:** salary, normal hours, off/rest days and all rates in Settings.

## Pay calculation

- **ORP (daily rate)** = monthly salary ÷ 26
- **HRP (hourly rate)** = ORP ÷ 8 (normal hours per day)

| Day type | Up to 8 h | Beyond 8 h |
|---|---|---|
| Normal day | hours × HRP × 1.5 | hours × HRP × 1.5 |
| Off day | hours × HRP × 1.0 | extra hours × HRP × 1.5 |
| Rest day | ≤ 4 h: ½ × ORP; > 4 h: 1 × ORP | + extra hours × HRP × 2.0 |
| Public holiday | 2 × ORP | + extra hours × HRP × 3.0 |

Example (salary RM2,600, so ORP RM100 and HRP RM12.50): working 10 h on an off day = 8 × 12.50 + 2 × 12.50 × 1.5 = **RM137.50**.

> Pay is always calculated with the **current** salary in Settings. If your salary changes, older entries are recalculated with the new salary too, so export older months before updating it.

## Run locally

```bash
npm start        # serves on http://localhost:8080
npm test         # runs the calculation unit tests
```

No build step and no dependencies: plain HTML, CSS and JavaScript (ES modules).

## Deploy (GitHub Pages)

1. Merge into `main`.
2. In the repo, go to **Settings → Pages → Source** and choose **GitHub Actions**.
3. The `Deploy to GitHub Pages` workflow runs the tests and publishes the site to `https://<user>.github.io/OT-Tracker/`.
4. Open that link on your phone:
   - **Android (Chrome):** menu → *Install app* / *Add to Home screen*
   - **iPhone (Safari):** Share → *Add to Home Screen*

When you change app files, bump `VERSION` in `sw.js` so installed apps pick up the update.

## Project structure

```
index.html            App shell
css/styles.css        Glass UI theme (white + green)
js/calc.js            Pay and day-type logic (pure, unit-tested)
js/holidays.js        Built-in Selangor public holidays
js/store.js           localStorage persistence, backup and restore
js/app.js             UI, views and interaction
sw.js                 Service worker (offline cache)
manifest.webmanifest  PWA manifest
icons/                App icons
tests/                Node test runner tests
```
