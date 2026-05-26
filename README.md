# Venture Grounds Advisor

An investor-quality startup-idea advisor grounded strictly in the views of 17 VCs from the Venture Grounds podcast.

Pressure-test your idea against real frameworks, contrarian takes, and pattern recognition from the show — and get a structured assessment: viability, focus directions, moat options, hardest objections, and which investors would lean in vs. pass.

## Stack

- Vercel serverless functions (Node.js 20)
- Anthropic Claude Sonnet 4
- Plain HTML + React via CDN (no build step)

## Local files

- `api/analyze.js` — the main endpoint that calls Anthropic with the grounded prompt
- `api/investors.js` — lightweight corpus listing for the UI
- `investors.json` — the knowledge base, regenerated from podcast transcripts
- `public/index.html` — the entire frontend

## Refresh workflow

When a new episode drops, replace `investors.json` with an updated extraction and push to GitHub. Vercel redeploys automatically.

## Environment

Set `ANTHROPIC_API_KEY` in Vercel's project settings → Environment Variables.
