"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type RosterEntry = { name: string; firm: string; role: string; stage: string };

const MODELS = [
  { id: "claude-fable-5", label: "Fable 5 — deepest" },
  { id: "claude-opus-4-8", label: "Opus 4.8" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 — fastest" },
];

const VERDICTS: Record<string, { label: string; color: string }> = {
  strong: { label: "Strong Fit", color: "var(--green)" },
  mixed: { label: "Mixed Signal", color: "var(--amber)" },
  weak: { label: "Weak Fit", color: "var(--red)" },
  depends: { label: "Depends on Execution", color: "var(--blue)" },
};

function parseModelJson(raw: string) {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Could not parse the Advisor's response.");
  }
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Advisor({ roster }: { roster: RosterEntry[] }) {
  const [idea, setIdea] = useState("");
  const [model, setModel] = useState("claude-fable-5");
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCorpus, setShowCorpus] = useState(false);
  const [charsSet, setCharsSet] = useState(0);

  // correspondence
  const [thread, setThread] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  const resultRef = useRef<HTMLDivElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  // deliberation sequence — cycles through the actual corpus
  const order = useMemo(() => shuffled(roster), [roster, phase === "running"]);
  const [delibIdx, setDelibIdx] = useState(0);
  useEffect(() => {
    if (phase !== "running") return;
    setDelibIdx(0);
    const t = setInterval(() => setDelibIdx((i) => (i + 1) % order.length), 1100);
    return () => clearInterval(t);
  }, [phase, order.length]);

  useEffect(() => {
    if (phase === "done" && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [phase]);

  const analyze = async () => {
    if (idea.trim().length < 30) {
      setError("Describe your idea in at least a few sentences so the analysis has something to work with.");
      return;
    }
    setError(null);
    setResult(null);
    setThread([]);
    setCharsSet(0);
    setPhase("running");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea.trim(), model }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `The press returned ${res.status}.`);
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let raw = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        setCharsSet(raw.length);
      }
      setResult(parseModelJson(raw));
      setPhase("done");
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
      setPhase("idle");
    }
  };

  const ask = async () => {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setQuestion("");
    setThread((t) => [...t, { role: "user", content: q }, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: idea.trim(),
          analysis: result,
          thread: thread,
          question: q,
          model,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `The press returned ${res.status}.`);
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setThread((t) => {
          const next = [...t];
          next[next.length - 1] = {
            role: "assistant",
            content: next[next.length - 1].content + chunk,
          };
          return next;
        });
        threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    } catch (e: any) {
      setThread((t) => {
        const next = [...t];
        next[next.length - 1] = {
          role: "assistant",
          content: `[The line dropped — ${e.message}. Ask again.]`,
        };
        return next;
      });
    } finally {
      setAsking(false);
    }
  };

  const reset = () => {
    setIdea("");
    setResult(null);
    setError(null);
    setThread([]);
    setPhase("idle");
  };

  const verdict = result?.viability?.verdict ? VERDICTS[result.viability.verdict] : null;
  const today = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    []
  );

  const sections = [
    ["#brief", "Brief"],
    ...(result
      ? ([
          ["#verdict", "Verdict"],
          ["#viability", "Viability"],
          ...(result.disagreement_ledger?.length ? [["#ledger", "Disagreements"]] : []),
          ["#focus", "Focus"],
          ["#moats", "Moats"],
          ...(result.pivot_considerations?.length ? [["#pivots", "Pivots"]] : []),
          ["#objections", "Objections"],
          ["#fit", "Fit"],
          ["#correspondence", "Correspondence"],
        ] as [string, string][])
      : []),
  ];

  let sec = 0;
  const num = () => `§ ${String(++sec).padStart(2, "0")}`;

  return (
    <div className="shell">
      {/* folio rail */}
      <nav className="rail" aria-label="Sections">
        <div className="rail-inner">
          <span className="rail-fleuron">❦</span>
          {sections.map(([href, label]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </div>
      </nav>

      {/* masthead */}
      <header className="masthead">
        <div className="masthead-meta">
          <span>Venture Grounds</span>
          <span>
            Vol. II · A Corpus of {roster.length} · {today}
          </span>
        </div>
        <h1>
          The Advisor<span className="terminal-dot">.</span>
        </h1>
        <p className="dek">
          Pressure-test your idea against {roster.length} venture capitalists from the Venture
          Grounds podcast — their frameworks, contrarian takes, and pattern recognition, grounded
          in actual transcripts.
        </p>
        <div className="masthead-foot">
          <button className="corpus-toggle" onClick={() => setShowCorpus(!showCorpus)}>
            <span className={`tri ${showCorpus ? "open" : ""}`}>▸</span>
            {showCorpus ? "Close the corpus" : `Open the corpus · ${roster.length} investors`}
          </button>
          <label className="model-select">
            <span className="kicker">Engine</span>
            <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model">
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {showCorpus && (
          <div className="corpus-list fade-up">
            {roster.map((inv, i) => (
              <div className="corpus-row" key={inv.name + inv.firm}>
                <span className="corpus-num">{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <span className="corpus-name">{inv.name}</span>
                  <div className="corpus-firm">
                    {inv.firm} · {inv.stage}
                  </div>
                </span>
              </div>
            ))}
          </div>
        )}
      </header>

      {/* brief */}
      <section className="brief" id="brief">
        <div className="section-head">
          <span className="num">{num()}</span>
          <h2>The brief</h2>
        </div>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          disabled={phase === "running"}
          placeholder="What problem are you solving? Who is the customer? What's your insight? What does the product look like?"
        />
        <div className="brief-meta">
          <span>{String(idea.length).padStart(4, "0")} char · more specific = sharper analysis</span>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button
            className="btn btn-primary"
            onClick={analyze}
            disabled={phase === "running" || !idea.trim()}
          >
            {phase === "running" ? "In deliberation…" : "Convene the panel →"}
          </button>
          {(idea || result) && phase !== "running" && (
            <button className="btn btn-ghost" onClick={reset}>
              Clear
            </button>
          )}
        </div>
        {error && <div className="error-box">{error}</div>}
      </section>

      {/* the deliberation */}
      {phase === "running" && (
        <section className="deliberation" aria-live="polite">
          <span className="kicker">The panel is deliberating</span>
          <div className="deliberation-name">
            Weighing — {order[delibIdx]?.name}
          </div>
          <div className="deliberation-firm">
            {order[delibIdx]?.firm} · {order[delibIdx]?.stage}
          </div>
          <div className="deliberation-counter">
            <span className="cursor-block" aria-hidden />
            <span>
              {charsSet > 0
                ? `Setting type · ${charsSet.toLocaleString()} characters`
                : "Consulting the corpus"}
            </span>
          </div>
        </section>
      )}

      {/* results */}
      {result && (
        <div ref={resultRef}>
          {/* verdict */}
          <section className="verdict-head fade-up" id="verdict">
            {verdict && (
              <div className="stamp" style={{ color: verdict.color }}>
                {verdict.label}
              </div>
            )}
            <p className="tldr">{result.tldr}</p>
            {result.epigraph?.quote && (
              <figure className="epigraph" style={{ margin: 0 }}>
                <blockquote>“{result.epigraph.quote}”</blockquote>
                <cite>— {result.epigraph.attribution}</cite>
              </figure>
            )}
          </section>

          {/* viability */}
          {result.viability && (
            <section className="section fade-up" id="viability">
              <div className="section-head">
                <span className="num">{num()}</span>
                <h2>Viability</h2>
              </div>
              <p className="prose">{result.viability.reasoning}</p>
              {result.viability.key_questions_to_answer?.length > 0 && (
                <div className="questions">
                  <span className="kicker">Open questions</span>
                  {result.viability.key_questions_to_answer.map((q: string, i: number) => (
                    <div className="q-row" key={i}>
                      <span className="q-num">Q{i + 1}</span>
                      <span>{q}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* disagreement ledger */}
          {result.disagreement_ledger?.length > 0 && (
            <section className="section fade-up" id="ledger">
              <div className="section-head">
                <span className="num">{num()}</span>
                <h2>Where the panel disagrees</h2>
              </div>
              <div className="rows">
                {result.disagreement_ledger.map((d: any, i: number) => (
                  <div className="row" key={i}>
                    <span className="row-num">{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <p className="ledger-topic">{d.topic}</p>
                      <div className="ledger-grid">
                        <div className="ledger-side">
                          <div className="who">{d.position_a?.investor}</div>
                          <div className="stance">{d.position_a?.stance}</div>
                        </div>
                        <div className="ledger-vs">VS</div>
                        <div className="ledger-side">
                          <div className="who">{d.position_b?.investor}</div>
                          <div className="stance">{d.position_b?.stance}</div>
                        </div>
                      </div>
                      <p className="ledger-implication">
                        <span className="ilabel">Take —</span>
                        {d.implication}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* focus directions */}
          {result.focus_directions?.length > 0 && (
            <section className="section fade-up" id="focus">
              <div className="section-head">
                <span className="num">{num()}</span>
                <h2>Where to focus</h2>
              </div>
              <div className="rows">
                {result.focus_directions.map((fd: any, i: number) => (
                  <div className="row" key={i}>
                    <span className="row-num">{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <h3>{fd.direction}</h3>
                      <p>{fd.rationale}</p>
                      {fd.specifics && (
                        <div className="next">
                          <span className="nlabel">NEXT →</span>
                          {fd.specifics}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* moats */}
          {result.moat_options?.length > 0 && (
            <section className="section fade-up" id="moats">
              <div className="section-head">
                <span className="num">{num()}</span>
                <h2>Moat options</h2>
              </div>
              <div className="rows">
                {result.moat_options.map((m: any, i: number) => (
                  <div className="row" key={i}>
                    <span className="row-num">{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <h3>{m.moat_type}</h3>
                      <p>{m.construction}</p>
                      <div className="attribution">
                        <span className="fleuron">◆</span>
                        {m.investor_basis}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* pivots */}
          {result.pivot_considerations?.length > 0 && (
            <section className="section fade-up" id="pivots">
              <div className="section-head">
                <span className="num">{num()}</span>
                <h2>Pivot considerations</h2>
              </div>
              <div className="rows">
                {result.pivot_considerations.map((p: any, i: number) => (
                  <div className="row" key={i}>
                    <span className="row-num">{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <h3>{p.pivot}</h3>
                      <p>
                        <span className="answer-label" style={{ color: "var(--accent)" }}>
                          WHEN —
                        </span>
                        {p.trigger}
                      </p>
                      <div className="attribution">
                        <span className="fleuron">◆</span>
                        {p.grounded_in}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* objections */}
          {result.counterarguments?.length > 0 && (
            <section className="section fade-up" id="objections">
              <div className="section-head">
                <span className="num">{num()}</span>
                <h2>Hardest objections</h2>
              </div>
              <div className="rows">
                {result.counterarguments.map((c: any, i: number) => (
                  <div className="row" key={i}>
                    <span className="row-num">{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <p className="objection-quote">“{c.objection}”</p>
                      <div className="objection-by">— {c.raised_by}</div>
                      <p>
                        <span className="answer-label">ANSWER —</span>
                        {c.how_to_address}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* fit */}
          {(result.investor_fit?.would_lean_in?.length > 0 ||
            result.investor_fit?.would_pass?.length > 0) && (
            <section className="section fade-up" id="fit">
              <div className="section-head">
                <span className="num">{num()}</span>
                <h2>Who leans in, who passes</h2>
              </div>
              <div className="fit-grid">
                <FitColumn
                  label="Lean in"
                  color="var(--green)"
                  items={result.investor_fit?.would_lean_in}
                  empty="No clear fits."
                />
                <FitColumn
                  label="Pass"
                  color="var(--red)"
                  items={result.investor_fit?.would_pass}
                  empty="None obvious."
                />
              </div>
            </section>
          )}

          {/* editor's note */}
          {result.missing_corpus_coverage && (
            <div className="editors-note fade-up">
              <span className="kicker">Editor's note</span>
              {result.missing_corpus_coverage}
            </div>
          )}

          {/* correspondence */}
          <section className="section fade-up" id="correspondence">
            <div className="section-head">
              <span className="num">{num()}</span>
              <h2>Correspondence</h2>
            </div>
            <p className="prose" style={{ color: "var(--ink-soft)", fontStyle: "italic" }}>
              Interrogate the verdict. Follow-ups stay grounded in the same corpus.
            </p>
            {thread.length > 0 && (
              <div className="thread">
                {thread.map((t, i) =>
                  t.role === "user" ? (
                    <div className="turn" key={i}>
                      <p className="turn-q">{t.content}</p>
                      {thread[i + 1]?.role === "assistant" && (
                        <p className="turn-a">
                          {thread[i + 1].content || (asking && i === thread.length - 2 ? "…" : "")}
                        </p>
                      )}
                    </div>
                  ) : null
                )}
                <div ref={threadEndRef} />
              </div>
            )}
            <div className="ask-bar">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask();
                  }
                }}
                placeholder="e.g. Which assumption would Jack McClelland test first?"
                disabled={asking}
              />
              <button className="btn btn-primary" onClick={ask} disabled={asking || !question.trim()}>
                {asking ? "…" : "Ask"}
              </button>
            </div>
          </section>

          {/* colophon */}
          <footer className="colophon">
            <div className="colophon-inner">
              <span>
                Grounded in {roster.length} investor profiles · Synthesis by Claude (
                {MODELS.find((m) => m.id === model)?.label.split(" — ")[0]})
              </span>
              <span>Not financial advice · Refresh KB as new episodes ship</span>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}

function FitColumn({
  label,
  color,
  items,
  empty,
}: {
  label: string;
  color: string;
  items: any[];
  empty: string;
}) {
  return (
    <div style={{ ["--fit-color" as any]: color }}>
      <div className="fit-col-head">
        <span className="dot" />
        <span className="kicker">{label}</span>
      </div>
      {items?.length > 0 ? (
        items.map((inv, i) => (
          <div className="fit-card" key={i}>
            <div className="fit-card-top">
              <span className="name">{inv.name}</span>
              <span className="firm">{inv.firm}</span>
            </div>
            <div className="why">{inv.why}</div>
            {inv.conviction && <span className="conviction">{inv.conviction} conviction</span>}
          </div>
        ))
      ) : (
        <div className="fit-empty">{empty}</div>
      )}
    </div>
  );
}
