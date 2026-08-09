import { useEffect, useState } from "react";
import { Chamfer, ArrowUpRight } from "./icons";

const links = [
  { href: "#philosophy", label: "Philosophy" },
  { href: "#catalogue", label: "Catalogue" },
  { href: "#principles", label: "Principles" },
];

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`}>
      means<Chamfer className="wordmark-mark" />
    </span>
  );
}

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <header className={`nav ${scrolled ? "nav-scrolled" : ""}`}>
        <div className="wrap nav-inner">
          <a href="#top" aria-label="Means — back to top" onClick={() => setOpen(false)}>
            <Wordmark />
          </a>
          <nav aria-label="Primary">
            <div className="nav-links">
              {links.map((l) => (
                <a key={l.href} className="nav-link" href={l.href}>
                  {l.label}
                </a>
              ))}
              <a className="nav-cta" href="mailto:hello@means.software">
                Contact
                <ArrowUpRight />
              </a>
            </div>
          </nav>
          <button
            className="nav-toggle"
            aria-expanded={open}
            aria-controls="nav-panel"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="bar" />
          </button>
        </div>
      </header>
      <div id="nav-panel" className={`nav-panel ${open ? "nav-panel-open" : ""}`}>
        <nav aria-label="Mobile">
          <div className="nav-panel-links">
            {links.map((l) => (
              <a key={l.href} className="nav-panel-link" href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </a>
            ))}
          </div>
          <a className="nav-panel-contact" href="mailto:hello@means.software" onClick={() => setOpen(false)}>
            Write to us
            <ArrowUpRight />
          </a>
          <p className="nav-panel-foot">Means — independent software studio</p>
        </nav>
      </div>
    </>
  );
}
