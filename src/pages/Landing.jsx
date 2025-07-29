import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const Landing = () => {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-black text-white px-6 pt-24 pb-16 max-w-6xl mx-auto font-sans relative overflow-x-hidden">
      <div
        className="absolute inset-0 bg-gradient-to-tr from-indigo-800 via-blue-800 to-black opacity-20 animate-gradient-move pointer-events-none"
        style={{ zIndex: -1 }}
      />

      {/* Hero */}
      <motion.header
        className="text-center mb-20"
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2 }}
      >
        <h1 className="text-5xl md:text-6xl font-extrabold mb-4 drop-shadow text-white">
          <TypewriterText text="Welcome to ProjectAlpha" speed={100} />
        </h1>
        <p className="text-indigo-200 text-lg max-w-2xl mx-auto font-medium">
          A dynamic GPA visualization platform powered by React, Supabase & Vercel.
        </p>
      </motion.header>

      {/* About Me */}
      <ScrollFade>
        <Section
          id="about"
          title="About Me"
          gradientFrom="indigo-800"
          gradientTo="indigo-700"
          border="indigo-300"
          text="I’m Shakib, a BBA Marketing student with a passion for tech and analytics.
          I build tools that merge education with intuitive, data-driven UI experiences."
        />
      </ScrollFade>

      {/* Project */}
      <ScrollFade>
        <Section
          id="project"
          title="Project"
          gradientFrom="blue-800"
          gradientTo="blue-700"
          border="blue-300"
          text="ProjectAlpha visualizes student academic performance trends in real-time, using Supabase for backend and React + Tailwind for clean, responsive design."
          button={{ label: 'Explore Project', onClick: () => navigate('/projects'), color: 'indigo' }}
        />
      </ScrollFade>

      {/* Result Analysis */}
      <ScrollFade>
        <Section
          id="analysis"
          title="Result Analysis"
          gradientFrom="green-800"
          gradientTo="green-700"
          border="green-300"
          text="Check performance by student ID or course code. Track GPA, rank, and grade distribution—all rendered instantly and interactively."
          button={{ label: 'Go to Analysis', onClick: () => navigate('/result-analysis'), color: 'green' }}
        />
      </ScrollFade>

      {/* Footer */}
      <footer className="text-center text-slate-400 mt-32 mb-6 text-sm select-none">
        © 2025 Shakib · ProjectAlpha — Built with React, Supabase & Vercel
      </footer>

      {/* Gradient Animation */}
      <style>{`
        @keyframes gradient-move {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient-move {
          background-size: 200% 200%;
          animation: gradient-move 15s ease infinite;
        }
      `}</style>
    </main>
  );
};

// Typewriter effect
const TypewriterText = ({ text = '', speed = 100 }) => {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    if (!text) return;
    let i = 0;
    const interval = setInterval(() => {
      setDisplayedText((prev) => prev + text[i]);
      i++;
      if (i >= text.length) clearInterval(interval);
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return <span>{displayedText}</span>;
};

// Section component
const Section = ({ id, title, gradientFrom, gradientTo, border, text, button }) => (
  <section
    id={id}
    className={`mb-20 rounded-xl bg-gradient-to-tr from-${gradientFrom} to-${gradientTo} p-10 shadow-xl hover:shadow-${gradientTo} transition-shadow duration-700`}
  >
    <h2 className={`text-4xl font-semibold mb-6 border-b-4 border-${border} inline-block pb-2`}>
      {title}
    </h2>
    <p className="text-slate-100 text-lg max-w-3xl leading-relaxed">{text}</p>
    {button && (
      <button
        onClick={button.onClick}
        className={`mt-8 px-8 py-4 bg-${button.color}-600 hover:bg-${button.color}-500 rounded-full font-semibold transition duration-300 shadow-lg shadow-${button.color}-700/50 text-lg`}
      >
        {button.label}
      </button>
    )}
  </section>
);

// Scroll-based fade animation
const ScrollFade = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 50 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.8 }}
    viewport={{ once: true, amount: 0.2 }}
  >
    {children}
  </motion.div>
);

export default Landing;
