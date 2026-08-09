import { useEffect, useRef } from "react";
import { ArrowUpRight } from "./icons";
import { NibGlyph, CaliperGlyph, JunctionGlyph, LensGlyph } from "./instruments";
import { products } from "../data/products";

const glyphs = {
  nib: NibGlyph,
  caliper: CaliperGlyph,
  junction: JunctionGlyph,
  lens: LensGlyph,
};

function useCursorTilt() {
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    if (!window.matchMedia("(hover: hover)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const items = Array.from(strip.querySelectorAll<HTMLElement>("[data-tilt]"));
    if (!items.length) return;

    const state = items.map((el) => {
      const base = parseFloat(el.dataset.rot ?? "0");
      return { el, base, px: 0, py: 0, tx: 0, ty: 0, tr: 0, cx: 0, cy: 0, targetX: 0, targetY: 0, targetR: 0 };
    });

    let raf = 0;

    const tick = () => {
      for (const s of state) {
        s.tx += (s.targetX - s.tx) * 0.12;
        s.ty += (s.targetY - s.ty) * 0.12;
        s.tr += (s.targetR - s.tr) * 0.12;
        s.el.style.transform = `translate3d(${s.tx}px, ${s.ty}px, 0) rotate(${s.base + s.tr}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onMove = (e: PointerEvent) => {
      for (const s of state) {
        const r = s.el.getBoundingClientRect();
        s.cx = r.left + r.width / 2;
        s.cy = r.top + r.height / 2;
        const dx = e.clientX - s.cx;
        const dy = e.clientY - s.cy;
        const dist = Math.hypot(dx, dy);
        if (dist < 460) {
          const f = 1 - dist / 460;
          s.targetX = dx * 0.055 * f;
          s.targetY = dy * 0.035 * f;
          s.targetR = dx * 0.011 * f;
        } else {
          s.targetX = 0;
          s.targetY = 0;
          s.targetR = 0;
        }
      }
    };

    const reset = () => {
      for (const s of state) {
        s.targetX = 0;
        s.targetY = 0;
        s.targetR = 0;
      }
    };

    strip.addEventListener("pointermove", onMove);
    strip.addEventListener("pointerleave", reset);
    return () => {
      strip.removeEventListener("pointermove", onMove);
      strip.removeEventListener("pointerleave", reset);
      cancelAnimationFrame(raf);
    };
  }, []);

  return stripRef;
}

export default function Hero() {
  const stripRef = useCursorTilt();
  const heroProducts = products.slice(0, 4);
  const tilts = [1.6, -1.4, 2.1, -1];

  return (
    <section className="hero" id="top" aria-label="Introduction">
      <div className="wrap hero-main">
        <p className="hero-label mono">Independent software studio</p>
        <h1 className="hero-title">
          Software with a
          <br />
          <em className="em">point of view</em>.
        </h1>
        <p className="hero-lead">
          Means is an independent studio. It builds focused products and digital tools that give
          people better ways to create, work, understand, and act.
        </p>
        <div className="hero-actions">
          <a className="btn" href="#catalogue">
            See the instruments
            <ArrowUpRight />
          </a>
          <a className="link-arrow" href="#principles">
            How Means works
            <ArrowUpRight />
          </a>
        </div>
      </div>
      <div className="wrap hero-strip" ref={stripRef}>
        {heroProducts.map((p, i) => {
          const Glyph = glyphs[p.instrument];
          return (
            <a
              key={p.id}
              className="instrument"
              href="#catalogue"
              data-tilt
              data-rot={tilts[i]}
              aria-label={`${p.name} — ${p.status}`}
            >
              <span className="instrument-fig">
                <Glyph draw />
                <span className="inst-shadow" aria-hidden="true" />
              </span>
              <span className="instrument-caption">
                <span className="instrument-name">{p.name}</span>
                <span className="instrument-status mono">{p.status}</span>
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
