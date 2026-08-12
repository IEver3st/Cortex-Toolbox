import Nav from "./components/Nav";
import Hero from "./components/Hero";
import Philosophy from "./components/Philosophy";
import Catalogue from "./components/Catalogue";
import Principles from "./components/Principles";
import Closing from "./components/Closing";

export default function App() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <Philosophy />
        <Catalogue />
        <Principles />
        <Closing />
      </main>
    </>
  );
}
