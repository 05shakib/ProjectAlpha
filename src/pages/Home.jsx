import AboutMe from "../components/AboutMe";
import Project from "../components/Project";
// Removed: import ResultAnalysis from "../components/ResultAnalysis"; // No longer directly embedded here

export default function Home() {
  return (
    <div className="px-4 md:px-12 py-8 space-y-24">
      <h1 className="text-4xl font-extrabold text-center mb-10 text-white-400">Welcome to ProjectAlpha!</h1>
      <p className="text-lg text-gray-300 text-center max-w-2xl mx-auto mb-16">
        Explore student and course analytics, learn about my projects, and more.
      </p>
      {/* If you still want AboutMe and Project components directly on Home: */}
      <AboutMe />
      <Project />
      {/* The ResultAnalysis component is now a separate page accessible via navigation. */}
    </div>
  );
}