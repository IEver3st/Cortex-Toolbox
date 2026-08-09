import { useEffect, useState } from "react";

const ends = ["write", "think", "decide", "build", "understand", "act"];

function Cycler() {
  const [i, setI] = useState(0);
  const [running, setRunning] = useState(true);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setRunning(false);
  }, []);

  useEffect(() => {
    if (!running || paused) return;
    const t = window.setInterval(() => {
      setI((v) => (v + 1) % ends.length);
    }, 2600);
    return () => window.clearInterval(t);
  }, [running, paused]);

  return (
    <span
      className="cycler"
      aria-hidden="true"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <span
        className="cycler-track"
        style={i === 0 ? undefined : { transform: `translateY(${-i * 100}%)` }}
      >
        {ends.map((w) => (
          <span key={w} className="cycler-cell">
            {w}
          </span>
        ))}
      </span>
    </span>
  );
}

export default function Philosophy() {
  return (
    <section className="sec" id="philosophy" aria-label="The meaning of Means">
      <div className="wrap philo">
        <div className="rv">
          <h2 className="philo-statement">
            A product is not the end.
            <br />
            It is a means to <Cycler />
            <span className="sr-only">write</span>.
          </h2>
        </div>
        <div className="rv">
          <p className="philo-note">
            <strong>means</strong>, noun — an instrument or method by which something is done or
            brought about.
          </p>
          <p className="philo-meta mono">Same spelling, singular and plural</p>
        </div>
      </div>
    </section>
  );
}
