import React, { useEffect, useState, useRef } from 'react';

const useScrollFadeIn = () => {
  const [visible, setVisible] = useState(false);
  const domRef = useRef();

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      });
    });
    observer.observe(domRef.current);
    return () => observer.disconnect();
  }, []);

  return { ref: domRef, style: { opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(40px)', transition: 'all 0.8s ease-out' } };
};

const Landing = () => {
  const fadeInAbout = useScrollFadeIn();
  const fadeInProject = useScrollFadeIn();
  const fadeInAnalysis = useScrollFadeIn();

  return (
    <main className="min-h-screen bg-gradient-to-r from-indigo-900 via-blue-900 to-black text-white px-6 py-16 max-w-6xl mx-auto font-sans">
      <header className="text-center mb-20">
        <h1 className="text-5xl font-extrabold tracking-wide mb-4">
          ProjectAlpha <span className="text-indigo-400">Dashboard</span>
        </h1>
        <p className="max-w-xl mx-auto text-indigo-200 text-lg">
          Interactive Result Analysis Platform combining React, Supabase & Vercel for seamless academic insights.
        </p>
      </header>

      <section {...fadeInAbout} className="mb-24 bg-gradient-to-tr from-indigo-800 to-indigo-700 rounded-xl p-8 shadow-lg hover:shadow-indigo-400 transition-shadow duration-700">
        <h2 className="text-4xl font-semibold mb-4 border-b-2 border-indigo-300 inline-block pb-2">About Me</h2>
        <p className="leading-relaxed text-indigo-200 max-w-3xl">
          I’m Shakib, a BBA Marketing student passionate about blending technology and data analytics.
          I focus on creating insightful digital solutions for education through web technologies and data visualization.
        </p>
      </section>

      <section {...fadeInProject} className="mb-24 bg-gradient-to-tr from-blue-800 to-blue-700 rounded-xl p-8 shadow-lg hover:shadow-blue-400 transition-shadow duration-700">
        <h2 className="text-4xl font-semibold mb-4 border-b-2 border-blue-300 inline-block pb-2">Project</h2>
        <p className="leading-relaxed text-blue-200 max-w-3xl">
          ProjectAlpha empowers academic institutions with powerful visualization of student performance trends.
          Leveraging modern tools like React for UI and Supabase for backend, it provides real-time, interactive analytics.
        </p>
        <button className="mt-6 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-full font-semibold transition-colors duration-300 shadow-lg shadow-indigo-700/50">
          Explore Project
        </button>
      </section>

      <section {...fadeInAnalysis} className="mb-24 bg-gradient-to-tr from-green-800 to-green-700 rounded-xl p-8 shadow-lg hover:shadow-green-400 transition-shadow duration-700">
        <h2 className="text-4xl font-semibold mb-4 border-b-2 border-green-300 inline-block pb-2">Result Analysis</h2>
        <p className="leading-relaxed text-green-200 max-w-3xl">
          Analyze results by student ID or course code with detailed GPA trends, rankings, and course-wise distributions.
          Gain data-driven insights to improve academic strategies.
        </p>
        <button className="mt-6 px-6 py-3 bg-green-600 hover:bg-green-500 rounded-full font-semibold transition-colors duration-300 shadow-lg shadow-green-700/50">
          Go to Analysis
        </button>
      </section>

      <footer className="text-center text-indigo-300 mt-20 mb-10 text-sm select-none">
        © 2025 Shakib | ProjectAlpha &nbsp;&middot;&nbsp; Built with React, Supabase & Vercel
      </footer>
    </main>
  );
};

export default Landing;
