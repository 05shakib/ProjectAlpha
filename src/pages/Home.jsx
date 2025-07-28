import AboutMe from "../components/AboutMe";
import Project from "../components/Project";
import ResultAnalysis from "../components/ResultAnalysis";

export default function Home() {
  return (
    <div className="px-4 md:px-12 py-8 space-y-24">
      <AboutMe />
      <Project />
      <ResultAnalysis />
    </div>
  );
}
