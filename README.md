# AI Presentation Generator

A production-oriented full-stack web app that generates complete slide decks from a topic using Hugging Face inference.

## Features
- Arabic-first experience (RTL UI and Arabic-oriented prompts/content)
- AI content generation into structured Markdown
- AI/fallback image generation per slide
- HTML slide rendering with animated modern design
- Themes: light, dark, corporate, creative
- Slide editing mode with markdown roundtrip
- Regenerate specific slide
- AI design suggestion endpoint
- Export to PDF (Puppeteer) and PPTX (pptxgenjs)

## Project Structure

```text
.
├── public/
│   ├── css/styles.css
│   ├── js/
│   │   ├── app.js
│   │   ├── services/api.js
│   │   └── utils/markdown.js
│   └── index.html
├── generated/
│   ├── images/
│   └── slides/
├── server.js
├── package.json
└── .env.example
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
```
Add your Hugging Face key to `.env`.

If deploying in a serverless environment (e.g., Vercel/AWS Lambda), set:
```bash
GENERATED_DIR=/tmp/generated
```
so generated files are written to a writable runtime directory.

3. Run app:
```bash
npm start
```

4. Open:
`http://localhost:3000`

## API Overview

### `POST /api/generate`
Input:
```json
{ "topic": "AI in Healthcare", "tone": "Professional", "slideCount": 8, "theme": "corporate" }
```
Output includes:
- `markdown` in required format (`# Slide Title` and bullets)
- `slides[]` with image URLs
- `htmlSlides` preview markup

### `POST /api/regenerate-slide`
Regenerates one slide for the given topic/tone.

### `POST /api/design-suggestions`
Returns quick AI-style deck design recommendations.

### `POST /api/export/pdf`
Converts rendered slide HTML into PDF.

### `POST /api/export/pptx`
Exports deck JSON into `.pptx`.

## Deployment

### Render / Railway / Fly.io
- Set environment vars from `.env.example`
- Ensure write permissions for `generated/`
- If deploying to serverless, switch exports to object storage (S3/R2)

### Docker (optional)
Use Node 20+, include Chromium deps for Puppeteer.

## Notes
- If Hugging Face is unavailable, app falls back to deterministic slide content and Picsum images.
- You can replace image fallback with Unsplash/Pexels API integration in `fetchImageForSlide()`.
- For serverless deployments where `/var/task` is read-only, the app auto-falls back to `/tmp/generated` unless `GENERATED_DIR` is explicitly provided.
