const principles = [
  {
    statement: "Useful before impressive",
    note: "A tool earns its place by doing something. Everything else is decoration, and decoration has to earn its place too.",
  },
  {
    statement: "Focused before expansive",
    note: "One clear job, done well, beats a dozen half-done ones. Scope is a feature.",
  },
  {
    statement: "Open where it matters",
    note: "Plain formats, real exports, honest limits. A locked door is a design failure.",
  },
  {
    statement: "Designed as one system",
    note: "Every product should feel like it shares a workshop with the others, not like a separate brand.",
  },
  {
    statement: "Built to remain understandable",
    note: "Software that explains itself ages better than software that only impresses.",
  },
];

export default function Principles() {
  return (
    <section className="sec" id="principles" aria-label="How Means works">
      <div className="wrap">
        <h2 className="sr-only">How Means works</h2>
        <div className="prin-list rv">
          {principles.map((p, i) => (
            <div className="prin" key={p.statement}>
              <span className="prin-idx mono">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="prin-statement">{p.statement}</h3>
              <p className="prin-note">{p.note}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
