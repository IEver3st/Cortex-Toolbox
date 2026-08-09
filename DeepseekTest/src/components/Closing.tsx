import { ArrowUpRight } from "./icons";
import { Wordmark } from "./Nav";

export default function Closing() {
  return (
    <>
      <section className="sec closing" id="contact" aria-label="Closing statement">
        <div className="wrap closing-grid">
          <div className="rv">
            <h2 className="closing-statement">
              The work is judged by what it <em className="em">enables</em>.
            </h2>
          </div>
          <div className="rv">
            <p className="closing-support">
              Means is an independent studio with no investors and no growth targets. It builds
              what it believes is missing and ships it when it is ready.
            </p>
            <div className="routes">
              <a className="route" href="#catalogue">
                See the catalogue
                <ArrowUpRight />
              </a>
              <a className="route" href="mailto:hello@means.software">
                Write to us
                <ArrowUpRight />
              </a>
            </div>
          </div>
        </div>
      </section>
      <footer className="footer">
        <div className="wrap footer-top">
          <div>
            <Wordmark />
            <p className="footer-tagline">Focused products and digital tools, made deliberately.</p>
          </div>
          <nav className="footer-links" aria-label="Footer">
            <a href="#philosophy">Philosophy</a>
            <a href="#catalogue">Catalogue</a>
            <a href="#principles">Principles</a>
          </nav>
          <div className="footer-contact">
            <span>Write to us</span>
            <a href="mailto:hello@means.software">hello@means.software</a>
            <span className="platform mono">Replies within a few days</span>
          </div>
        </div>
        <div className="wrap">
          <p className="colophon">
            <span>© 2026 Means · independent software studio</span>
            <span>Set in Sentient and Satoshi · no templates were harmed</span>
          </p>
        </div>
        <p className="signature" aria-hidden="true">
          means
          <svg className="signature-mark" viewBox="0 0 12 12" fill="currentColor" focusable="false">
            <path d="M1.5 1.5 H9 L10.5 3 V10.5 H1.5 Z" />
          </svg>
        </p>
      </footer>
    </>
  );
}
