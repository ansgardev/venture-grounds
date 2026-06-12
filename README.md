# The Advisor — Venture Grounds

Pressure-test a founder's idea against 17 venture capitalists from the Venture Grounds podcast — their frameworks, contrarian takes, and pattern recognition, grounded strictly in interview transcripts.

Next.js 15 + React 19, powered by **Claude Fable 5** with prompt caching and streaming. The full investor knowledge base lives server-side only (`lib/kb.ts`) and is never shipped to the browser.

---

## What's in here

```
app/
  page.tsx          Server component — passes a slim investor roster to the client
  advisor.tsx       The full client UI (input, deliberation sequence, results, correspondence)
  layout.tsx        Fonts (Instrument Serif, Newsreader, JetBrains Mono) + metadata
  globals.css       The complete design system
  api/
    analyze/        POST — streams the structured analysis (cached system prompt)
    followup/       POST — streams grounded follow-up answers (Correspondence mode)
lib/
  kb.ts             The 17-investor knowledge base (server-only)
  prompts.ts        System prompt builders for analysis + follow-up
```

## Deploy to Vercel

### Option A — GitHub import (recommended)

1. Push this folder to a GitHub repo:
   ```bash
   git init && git add -A && git commit -m "The Advisor"
   gh repo create vg-advisor --private --source=. --push   # or push manually
   ```
2. Go to [vercel.com/new](https://vercel.com/new), import the repo. Vercel auto-detects Next.js — no config needed.
3. In **Project → Settings → Environment Variables**, add:
   ```
   ANTHROPIC_API_KEY = sk-ant-...
   ```
4. Deploy. Done.

### Option B — Vercel CLI

```bash
npm i -g vercel
vercel                          # link + first deploy
vercel env add ANTHROPIC_API_KEY
vercel --prod
```

### Important notes

- **Rotate your API key if the Replit version embedded it client-side.** This rebuild keeps the key strictly server-side, but any key that ever shipped to a browser should be treated as compromised. Generate a fresh one at console.anthropic.com and revoke the old one.
- **Function duration:** `/api/analyze` declares `maxDuration = 300`. On the Vercel Hobby plan, Fluid Compute (on by default for new projects) allows up to 300s; if your project predates Fluid Compute, Hobby caps at 60s — enable Fluid Compute in Project Settings → Functions, or upgrade to Pro. Streaming starts within a few seconds either way, so users see output almost immediately.
- **Local dev:** `cp .env.example .env.local`, add your key, then `npm run dev`.

## Models & cost

The engine selector offers three models:

| Model | String | Pricing (in/out per MTok) |
|---|---|---|
| Claude Fable 5 (default) | `claude-fable-5` | $10 / $50 |
| Claude Opus 4.8 | `claude-opus-4-8` | $5 / $25 |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | $3 / $15 |

The ~30K-character knowledge base is sent with `cache_control: ephemeral`, so repeat analyses within the cache window pay ~10% of the input cost for the KB. A typical Fable 5 analysis runs a few cents; correspondence follow-ups are cheaper still.

## Updating the corpus

New episode → extract the investor profile into the JSON structure in `lib/kb.ts` (follow any existing entry as the template), append to the `investors` array, redeploy. The masthead count, corpus list, deliberation sequence, and prompt all read from it dynamically.
