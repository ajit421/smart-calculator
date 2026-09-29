# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A static, dependency-free web app: the user handwrites a math expression on an HTML5 canvas, and the canvas image is sent to Google Gemini, which transcribes and solves it step by step. The whole app is three files: `index.html`, `main.js`, `style.css`. There is no build step, package manager, linter, or test suite.

## Running locally

1. Create `config.js` in the repo root (it is gitignored):
   ```js
   window.GEMINI_API_KEY = "your-key";
   ```
2. Serve the directory over HTTP (for example `python -m http.server 8000`) and open `http://localhost:8000`. Opening `index.html` directly from disk also mostly works.

If `config.js` is missing, the app still loads, but **Calculate** shows an "API key not configured" error.

## Deployment

A push to `main` triggers `.github/workflows/deploy.yml`. The workflow writes `config.js` from the `GEMINI_API_KEY` repository secret and publishes the whole repo root to GitHub Pages (https://ajit421.github.io/smart-calculator). This means the key ends up in client-side JS on the public site. That is a known property of this design, not a bug to fix silently.

The asset links in `index.html` use `?v=__BUILD__`. The workflow replaces this with the commit SHA so each deploy gets fresh URLs. GitHub Pages sends `Cache-Control: max-age=600`, and without this step browsers kept stale CSS after a redesign. Keep the placeholder on any new local CSS/JS link.

## Architecture (main.js)

All the logic lives in a single `SmartCalculator` class, which is instantiated on `DOMContentLoaded`. It binds to DOM elements by id (`drawingCanvas`, `calculateBtn`, `resultContent`, `statusDot`, `eraserBtn`, and others), so renaming an id in `index.html` means updating `main.js` too.

- **Canvas and high-DPI:** `initializeCanvas` sizes the backing store to `rect * devicePixelRatio` and calls `ctx.scale(dpr, dpr)`. A debounced resize redoes this and then redraws from history.
- **Undo/redo:** `history` is an array of full-canvas `toDataURL()` snapshots, capped at 50, with `historyStep` as the cursor. `saveState()` runs after each stroke or clear. `restoreState()` fills the `#fafafa` background and then draws the snapshot.
- **Eraser:** paints `#fafafa` with `source-over`. Don't switch it to `destination-out`: that leaves transparent pixels, which fail `isCanvasEmpty` and go into the PNG sent to Gemini. Its composite mode also leaks into `clearCanvas`/`restoreState` and wipes the canvas on undo.
- **Empty check:** `isCanvasEmpty()` compares every pixel against the `#fafafa` background (`0xfffafafa`). If you change the canvas background color, update it here and in `restoreState`/`clearCanvas` as well.
- **Gemini call (`calculate`):** POSTs the canvas as base64 PNG together with a text prompt to `gemini-3.8-flash:generateContent` (v1beta REST, key passed as a query param). The prompt tells the model to return `Expression: / Step N: / Final Answer:` lines with the math wrapped in `$$ … $$`.
- **Result rendering (`showResult`):** escapes `<` and `>`, converts `**bold**` and newlines to HTML, then calls `MathJax.typesetPromise` on the result container. MathJax 3 is loaded from a CDN in `index.html`, where inline math `$…$` and `\(…\)` is configured. If you change the prompt's output format, keep it compatible with this formatting and with MathJax.
