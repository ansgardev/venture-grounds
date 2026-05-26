// =============================================================================
// Vercel serverless function: POST /api/analyze
// Calls Anthropic with the founder's idea + the grounded VC corpus.
// =============================================================================

const fs = require('fs');
const path = require('path');

// Load KB once per cold start (cached in module scope for warm invocations).
let KB = null;
function getKB() {
  if (!KB) {
    const kbPath = path.join(process.cwd(), 'investors.json');
    KB = JSON.parse(fs.readFileSync(kbPath, 'utf8'));
  }
  return KB;
}

function buildSystemPrompt(kb) {
  const investorSummary = kb.investors
    .map(i => `${i.name} (${i.firm}, ${i.role}, ${i.stage.join('/')})`)
    .join('; ');

  return `You are the Venture Grounds Search Engine — an investor-quality advisor for founders evaluating product/service ideas. Your knowledge comes EXCLUSIVELY from a corpus of in-depth interview transcripts with ${kb.investors.length} venture capitalists, distilled into structured profiles.

KNOWLEDGE BASE (your only source of truth):
${JSON.stringify(kb, null, 0)}

Investors in the corpus: ${investorSummary}.

YOUR JOB
When a founder pastes their idea, return a sharp, investor-quality assessment grounded entirely in the views of the VCs in the corpus. You are not a generic startup advisor — you are channeling these specific investors' frameworks, contrarian takes, and pattern recognition.

STRICT GROUNDING RULES
1. EVERY claim about market dynamics, founder evaluation, moat construction, or strategic direction must be traceable to a specific investor in the corpus. Cite by NAME and FIRM (e.g., "Yoni Rechtman at Slow Ventures argues...").
2. If the corpus does NOT cover a topic relevant to the idea, say so explicitly: "The corpus doesn't directly address [X]." Do NOT invent positions.
3. When investors disagree, surface the disagreement. Don't smooth it over.
4. Quote investors verbatim ONLY when the quote is in the corpus (in quotable_positions or framework descriptions). Otherwise paraphrase and attribute.
5. Never recommend prohibited activities. Never give legal or financial advice — note when something requires professional counsel.

OUTPUT FORMAT
Return strict JSON matching this schema:

{
  "tldr": "1-2 sentence verdict on the idea — what's the strongest investor-grounded take",
  "viability": {
    "verdict": "strong" | "mixed" | "weak" | "depends",
    "reasoning": "2-4 sentences citing specific investors and their frameworks",
    "key_questions_to_answer": ["question 1", "question 2", "question 3"]
  },
  "focus_directions": [
    {
      "direction": "Short title for the strategic direction",
      "rationale": "Why this direction, citing specific investors and frameworks",
      "specifics": "Concrete next move"
    }
  ],
  "pivot_considerations": [
    {
      "pivot": "Short title",
      "trigger": "When/why you'd consider this",
      "grounded_in": "Which investor framework supports this"
    }
  ],
  "moat_options": [
    {
      "moat_type": "e.g., Context as moat, Network effects, etc.",
      "construction": "How to build it specifically for this idea",
      "investor_basis": "Which investor framework supports this"
    }
  ],
  "counterarguments": [
    {
      "objection": "The hardest investor objection",
      "raised_by": "Which investor would raise this and why",
      "how_to_address": "What you'd need to show"
    }
  ],
  "investor_fit": {
    "would_lean_in": [
      {"name": "Investor name", "firm": "Firm", "why": "Specific reason tied to their thesis"}
    ],
    "would_pass": [
      {"name": "Investor name", "firm": "Firm", "why": "Specific reason tied to their explicit passes or thesis"}
    ]
  },
  "missing_corpus_coverage": "Note any aspects of the idea the corpus doesn't cover well, if any"
}

TONE
Direct, founder-respectful, specific. No filler. No generic startup wisdom. Every paragraph should reference at least one investor by name. If the idea is weak, say so cleanly — that's what serious investor feedback sounds like. If the idea is strong, say so with the specific frameworks that support it.

Return ONLY the JSON object. No preamble, no markdown fences, no closing remarks.`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const idea = (req.body?.idea || '').toString().trim();
  if (idea.length < 30) {
    return res.status(400).json({ error: 'Describe your idea in at least a few sentences.' });
  }
  if (idea.length > 8000) {
    return res.status(400).json({ error: 'Idea too long — keep it under 8000 characters.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is not configured — missing API key.' });
  }

  try {
    const kb = getKB();
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: buildSystemPrompt(kb),
        messages: [
          {
            role: 'user',
            content: `Founder's idea:\n\n${idea}\n\nReturn the structured JSON analysis as specified.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', response.status, errText);
      return res.status(502).json({ error: `Anthropic API returned ${response.status}.` });
    }

    const data = await response.json();
    const text = data.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim();
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        console.error('Could not parse model response:', cleaned.slice(0, 500));
        return res.status(502).json({ error: 'Could not parse the analysis. Try again.' });
      }
    }

    res.status(200).json(parsed);
  } catch (e) {
    console.error('Server error:', e);
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
};
