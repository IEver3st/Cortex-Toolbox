export type Status = "In development" | "Exploration" | "Details forthcoming";

export type Product = {
  id: string;
  index: string;
  name: string;
  purpose: string;
  status: Status;
  platform: string;
  note: string;
  instrument: "nib" | "caliper" | "junction" | "lens";
};

export const products: Product[] = [
  {
    id: "folio",
    index: "01",
    name: "Folio",
    purpose: "A writing environment that stays out of the way. Long-form text in plain format, editing without ceremony.",
    status: "In development",
    platform: "Windows · macOS · Linux",
    note: "Folio is being built as a native desktop application. It treats the text itself as the document, keeps formatting light, and does not interrupt. More detail will appear here when the shape of the release is settled.",
    instrument: "nib",
  },
  {
    id: "cadence",
    index: "02",
    name: "Cadence",
    purpose: "A tracker for long projects that cares about momentum, not streaks. See progress without the guilt.",
    status: "Exploration",
    platform: "Web · Mobile",
    note: "Cadence is an exploration of how a tool can keep a long project visible without turning it into a source of pressure. It is at the sketch stage. Nothing to install yet.",
    instrument: "caliper",
  },
  {
    id: "relay",
    index: "03",
    name: "Relay",
    purpose: "A small tool for passing work between people with the context attached, and the noise left behind.",
    status: "Exploration",
    platform: "Web",
    note: "Relay is an experiment in focused handoffs: what a message between two working people can look like when it carries the work itself, not a thread of replies about it.",
    instrument: "junction",
  },
  {
    id: "sift",
    index: "04",
    name: "Sift",
    purpose: "Reading notes that keep their context, so what you once thought is still findable later.",
    status: "Details forthcoming",
    platform: "Platform to be confirmed",
    note: "Sift is being designed. The question it starts from: why does the useful part of what you read always evaporate? More information when the shape is settled.",
    instrument: "lens",
  },
];
