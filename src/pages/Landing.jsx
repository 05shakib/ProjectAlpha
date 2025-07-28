import React from 'react';

const Landing = () => {
  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 px-6 py-12 max-w-5xl mx-auto">
      <section id="about-me" className="mb-16">
        <h1 className="text-4xl font-bold mb-4">About Me</h1>
        <p className="text-lg leading-relaxed max-w-3xl">
          Hello, I’m Shakib, a BBA student majoring in Marketing with a passion for technology and data analytics.  
          I enjoy applying analytical tools to marketing problems and exploring data-driven solutions to business challenges.
          Currently, I am developing projects that integrate React, Supabase, and modern web technologies.
        </p>
      </section>

      <section id="project" className="mb-16">
        <h2 className="text-3xl font-semibold mb-4">Project</h2>
        <p className="text-lg max-w-3xl leading-relaxed">
          ProjectAlpha is an advanced result analysis system designed to visualize student academic performance trends
          through interactive charts and dynamic queries. It leverages React for the frontend, Supabase for backend data management,
          and Vercel for fast and reliable deployment.
        </p>
      </section>

      <section id="result-analysis" className="mb-16">
        <h2 className="text-3xl font-semibold mb-4">Result Analysis</h2>
        <p className="text-lg max-w-3xl leading-relaxed">
          The Result Analysis module allows users to search and analyze academic results by student ID or course code.  
          It provides detailed grade distributions, GPA trends, rankings, and comparative analytics to enhance insights into student performance.
        </p>
        <p className="mt-4">
          You can navigate to the <strong>Result Analysis</strong> page from the header to start exploring the system.
        </p>
      </section>
    </main>
  );
};

export default Landing;
