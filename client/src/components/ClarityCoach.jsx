import React, { useEffect, useMemo, useRef, useState } from "react";
import { guidanceAsk, guidanceTopics, guidanceNode, loadLastVaaniResult } from "../utils/api.js";

const CRITERION_LABEL = {
  fluency_coherence: "Fluency & Coherence",
  lexical_resource: "Lexical Resource",
  grammatical_range: "Grammatical Range & Accuracy",
  pronunciation: "Pronunciation",
};

function MarkdownLite({ text }) {
  if (!text) return null;
  const nodes = [];
  const paras = text.split(/\n\n+/);
  paras.forEach((para, pi) => {
    const parts = [];
    let i = 0;
    para.replace(/\*\*([^*]+)\*\*/g, (match, bold, offset) => {
      if (offset > i) parts.push(para.slice(i, offset));
      parts.push(<b key={`b-${pi}-${offset}`}>{bold}</b>);
      i = offset + match.length;
      return match;
    });
    if (i < para.length) parts.push(para.slice(i));
    nodes.push(<p key={pi}>{parts}</p>);
  });
  return <>{nodes}</>;
}

function BubbleSystem({ title, body, confidence, personalised, related, onRelated, fallback, neuro, neuroDegraded, intro }) {
  return (
    <div className={`cc-bubble cc-bubble--sys ${fallback ? "cc-bubble--fallback" : ""} ${intro ? "cc-bubble--intro" : ""}`}>
      {title && <div className="cc-bubble-title">{title}</div>}
      <div className="cc-bubble-body"><MarkdownLite text={body} /></div>
      {!fallback && !intro && personalised && (
        <div className="cc-bubble-meta">
          <span className="cc-chip cc-chip--accent">Personalised for you</span>
        </div>
      )}
      {related && related.length > 0 && (
        <div className="cc-related">
          <div className="cc-related-label">Related</div>
          <div className="cc-related-list">
            {related.map((r) => (
              <button key={r.id} className="cc-chip cc-chip--link" onClick={() => onRelated(r.id)}>
                {r.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BubbleUser({ text }) {
  return (
    <div className="cc-bubble cc-bubble--user">
      <div className="cc-bubble-body">{text}</div>
    </div>
  );
}

function ContextStrip({ ctx, onClear }) {
  if (!ctx || !ctx.overall_band) return null;
  const weakest = ctx.weakest_criterion ? CRITERION_LABEL[ctx.weakest_criterion] || ctx.weakest_criterion : null;
  const ageHrs = ctx.last_session_age_sec ? ctx.last_session_age_sec / 3600 : null;
  const ageLabel = ageHrs !== null
    ? ageHrs < 1 ? "just now" : ageHrs < 24 ? `${Math.round(ageHrs)} hrs ago` : `${Math.round(ageHrs / 24)} days ago`
    : "";
  return (
    <div className="cc-context">
      <div className="cc-context-title">Personalised from your last Vaani session · {ageLabel}</div>
      <div className="cc-context-row">
        <span className="cc-chip cc-chip--muted">Band {Number(ctx.overall_band).toFixed(1)}</span>
        {weakest && <span className="cc-chip cc-chip--muted">Weakest: {weakest}</span>}
        {ctx.l1_display_name && <span className="cc-chip cc-chip--muted">L1: {ctx.l1_display_name}</span>}
        <button type="button" className="cc-chip cc-chip--close" onClick={onClear} title="Clear context">×</button>
      </div>
    </div>
  );
}

export default function ClarityCoach() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => ([
    { role: "system",
      intro: true,
      title: "Hi — I'm Ask Vaani.",
      body: "Ask me anything about IELTS or TOEFL Speaking — structure, scoring, pronunciation, fluency, grammar, vocabulary, exam day, how long to improve.",
      confidence: 1.0, personalised: false, related: [] }
  ]));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [topics, setTopics] = useState([]);
  const [showTopics, setShowTopics] = useState(false);
  const [ctx, setCtx] = useState(() => loadLastVaaniResult());
  const endRef = useRef(null);

  const buildContext = useMemo(() => () => {
    if (!ctx) return null;
    return {
      overall_band: ctx.overall_band ?? null,
      weakest_criterion: ctx.weakest_criterion ?? null,
      criterion_bands: ctx.criterion_bands ?? null,
      l1_display_name: ctx.l1_display_name ?? null,
      l1_code: ctx.l1_code ?? null,
      test_type: ctx.test_type ?? null,
      last_session_age_sec: ctx.last_session_age_sec ?? null,
    };
  }, [ctx]);

  useEffect(() => {
    if (open && topics.length === 0) {
      guidanceTopics().then((d) => setTopics(d.categories || [])).catch(() => {});
    }
  }, [open, topics.length]);

  useEffect(() => {
    if (open) setCtx(loadLastVaaniResult());
  }, [open]);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function submitQuery(q) {
    const query = (q || input).trim();
    if (!query || loading) return;
    setInput("");
    setShowTopics(false);
    setMessages((prev) => [...prev, { role: "user", text: query }]);
    setLoading(true);
    try {
      const data = await guidanceAsk(query, buildContext());
      setMessages((prev) => [...prev, {
        role: "system",
        title: data.title,
        body: data.answer,
        confidence: data.confidence,
        personalised: data.personalised,
        related: data.related || [],
        fallback: !!data.fallback,
        neuro: !!data.neuro_active,
        neuroDegraded: data.neuro_configured && !data.neuro_active && !data.fallback,
      }]);
    } catch (e) {
      setMessages((prev) => [...prev, {
        role: "system",
        title: "Connection error",
        body: `I couldn't reach the Clarity engine: ${e.message || "unknown error"}. Please try again.`,
        confidence: 0, personalised: false, related: [], fallback: true,
      }]);
    } finally {
      setLoading(false);
    }
  }

  async function openRelated(nodeId) {
    setLoading(true);
    try {
      const data = await guidanceNode(nodeId);
      setMessages((prev) => [...prev, {
        role: "system",
        title: data.title,
        body: data.answer,
        confidence: data.confidence ?? 1.0,
        personalised: false,
        related: data.related || [],
      }]);
    } catch (e) {
      setMessages((prev) => [...prev, {
        role: "system",
        title: "Couldn't load that topic",
        body: e.message || "unknown error",
        confidence: 0, fallback: true,
      }]);
    } finally {
      setLoading(false);
    }
  }

  const quickPrompts = ctx && ctx.overall_band
    ? [
        `What should I focus on first given my last band of ${Number(ctx.overall_band).toFixed(1)}?`,
        `How long will it take me to reach Band 7?`,
        ctx.weakest_criterion === "pronunciation" ? "How do I fix L1 transfer in my pronunciation?" : "What are the four IELTS criteria?",
        "What happens in Part 2?",
      ]
    : [
        "What happens in Part 2?",
        "How many parts does IELTS Speaking have?",
        "How fast should I speak?",
        "Do I need a British accent?",
      ];

  return (
    <>
      {!open && (
        <button
          type="button"
          className="cc-fab"
          onClick={() => setOpen(true)}
          aria-label="Open Ask Vaani"
        >
          <span className="cc-fab-icon" aria-hidden="true">💬</span>
          <span className="cc-fab-label">
            <span className="cc-fab-title">Ask Vaani</span>
            <span className="cc-fab-sub">IELTS &amp; TOEFL Speaking · ask anything</span>
          </span>
        </button>
      )}

      {open && (
        <div className="cc-panel" role="dialog" aria-label="Ask Vaani">
          <header className="cc-header">
            <div className="cc-header-left">
              <div className="cc-header-mark">V</div>
              <div>
                <div className="cc-header-title">Ask Vaani</div>
                <div className="cc-header-sub">IELTS &amp; TOEFL Speaking · ask anything</div>
              </div>
            </div>
            <div className="cc-header-actions">
              <button
                type="button"
                className="cc-icon-btn"
                onClick={() => setShowTopics((s) => !s)}
                title="Browse topics"
                aria-label="Browse topics"
              >
                ☰
              </button>
              <button
                type="button"
                className="cc-icon-btn"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </header>

          <ContextStrip ctx={ctx} onClear={() => setCtx(null)} />

          <div className="cc-body">
            {showTopics ? (
              <div className="cc-topics">
                <div className="cc-topics-heading">Browse topics</div>
                {topics.map((cat) => (
                  <div key={cat.id} className="cc-topic-cat">
                    <div className="cc-topic-cat-label">{cat.label}</div>
                    <div className="cc-topic-list">
                      {cat.nodes.map((n) => (
                        <button
                          key={n.id}
                          className="cc-topic-link"
                          onClick={() => { setShowTopics(false); openRelated(n.id); }}
                        >
                          {n.title}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="cc-stream">
                {messages.map((m, i) =>
                  m.role === "user"
                    ? <BubbleUser key={i} text={m.text} />
                    : <BubbleSystem
                        key={i}
                        title={m.title}
                        body={m.body}
                        confidence={m.confidence}
                        personalised={m.personalised}
                        related={m.related}
                        fallback={m.fallback}
                        neuro={m.neuro}
                        neuroDegraded={m.neuroDegraded}
                        intro={m.intro}
                        onRelated={openRelated}
                      />
                )}
                {loading && (
                  <div className="cc-bubble cc-bubble--sys cc-bubble--loading">
                    <span className="cc-dot" /> <span className="cc-dot" /> <span className="cc-dot" />
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>

          {!showTopics && (
            <div className="cc-quick">
              {quickPrompts.map((qp, i) => (
                <button key={i} className="cc-chip cc-chip--suggest" onClick={() => submitQuery(qp)}>
                  {qp}
                </button>
              ))}
            </div>
          )}

          <form
            className="cc-composer"
            onSubmit={(e) => { e.preventDefault(); submitQuery(); }}
          >
            <input
              className="cc-composer-input"
              placeholder="Ask about IELTS or TOEFL — e.g. 'how do I fix my th sound?'"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={500}
              disabled={loading}
            />
            <button type="submit" className="cc-composer-send" disabled={loading || !input.trim()}>
              Ask
            </button>
          </form>

          <footer className="cc-footer">
            <span>Answers are grounded in Vaani's curated coaching knowledge — not free-form generation.</span>
          </footer>
        </div>
      )}
    </>
  );
}
