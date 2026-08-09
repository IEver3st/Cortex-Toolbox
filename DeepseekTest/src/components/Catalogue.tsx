import { useState } from "react";
import { ArrowUpRight, Chevron } from "./icons";
import { NibGlyph, CaliperGlyph, JunctionGlyph, LensGlyph } from "./instruments";
import { products } from "../data/products";
import type { Product, Status } from "../data/products";

const glyphs = {
  nib: NibGlyph,
  caliper: CaliperGlyph,
  junction: JunctionGlyph,
  lens: LensGlyph,
};

const statusClass: Record<Status, string> = {
  "In development": "status-dev",
  Exploration: "status-exp",
  "Details forthcoming": "status-fut",
};

function Row({ product, draw }: { product: Product; draw: boolean }) {
  const [open, setOpen] = useState(false);
  const Glyph = glyphs[product.instrument];
  const panelId = `panel-${product.id}`;

  return (
    <li>
      <button
        className="cat-row"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="cat-idx mono">{product.index}</span>
        <span className="cat-fig">
          <Glyph draw={draw} />
        </span>
        <span>
          <span className="cat-name">{product.name}</span>
          <span className="cat-purpose">{product.purpose}</span>
        </span>
        <span className="cat-meta">
          <span className={`status ${statusClass[product.status]}`}>
            <span className="dot" aria-hidden="true" />
            {product.status}
          </span>
          <span className="platform mono">{product.platform}</span>
        </span>
        <Chevron className="cat-chev" />
      </button>
      <div id={panelId} className={`cat-panel ${open ? "cat-panel-open" : ""}`}>
        <div className="cat-panel-inner">
          <div className="cat-panel-body">
            <span aria-hidden="true" />
            <div>
              <p className="cat-note">{product.note}</p>
              <a className="cat-ask" href={`mailto:hello@means.software?subject=${product.name}`}>
                Ask about {product.name}
                <ArrowUpRight />
              </a>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

export default function Catalogue() {
  return (
    <section className="bench" id="catalogue" aria-label="The instrument catalogue">
      <div className="wrap bench-pad">
        <div className="cat-head rv">
          <p className="cat-head-label mono">
            The catalogue · <strong>04 instruments</strong>
          </p>
          <p className="cat-head-note">Entries are honest about where they stand.</p>
        </div>
        <ul className="catalogue rv">
          {products.map((p) => (
            <Row key={p.id} product={p} draw />
          ))}
        </ul>
        <div className="cat-foot rv">
          <span>
            Product pages are written when the products are real enough to describe. Until then,
            the work happens quietly.
          </span>
          <a href="mailto:hello@means.software">
            Write to us
            <ArrowUpRight />
          </a>
        </div>
      </div>
    </section>
  );
}
