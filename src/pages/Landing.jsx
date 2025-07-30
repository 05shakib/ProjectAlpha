import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

// SVG Icons for social media and feedback buttons
const LinkedInIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-linkedin">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
    <rect width="4" height="12" x="2" y="9"/>
    <circle cx="4" cy="4" r="2"/>
  </svg>
);

const WhatsAppIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-circle">
    <path d="M7.9 20A9.3 9.3 0 0 1 4 16.1L2 22l5.9-2Z"/>
    <path d="M16 19a8 8 0 0 0 3.8-3.8L22 12l-5.9 2Z"/>
    <circle cx="12" cy="12" r="10"/>
  </svg>
);

const FacebookIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-facebook">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
  </svg>
);

const FeedbackIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-square">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);


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
          <TypewriterText key="hero-typewriter" text=" Welcome to ProjectAlpha" speed={100} />
        </h1>
        <p className="text-indigo-200 text-lg max-w-2xl mx-auto font-medium">
          A dynamic GPA visualization platform, empowering students and faculty with clear, interactive insights into academic performance.
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
          text="I’m Shakib, a BBA Marketing student with a passion for tech and analytics."
          buttons={[
            { label: 'LinkedIn', href: 'https://www.linkedin.com/in/md-nazmul-islam-shakib/', color: 'blue', icon: LinkedInIcon },
            { label: 'WhatsApp', href: 'https://api.whatsapp.com/send?phone=8801603391478&text=Hello%20from%20the%20other%20side!', color: 'green', icon: WhatsAppIcon },
            { label: 'Facebook', href: 'https://www.facebook.com/05shakib', color: 'blue-800', icon: FacebookIcon },
          ]}
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
          text="ProjectAlpha visualizes student academic performance trends in real-time, using backend database and a clean, responsive design."
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

      {/* Anonymous Feedback */}
      <ScrollFade>
        <Section
          id="feedback"
          title="Anonymous Feedback"
          gradientFrom="purple-800"
          gradientTo="purple-700"
          border="purple-300"
          text="Your anonymous feedback helps me improve! Share your thoughts, suggestions, or any issues you encounter."
          button={{ label: 'Give Feedback', href: 'https://ngl.link/kowkikoiba', color: 'purple', icon: FeedbackIcon }}
        />
      </ScrollFade>
      
      {/* Footer */}
      <footer className="text-center text-slate-400 mt-32 mb-6 text-sm select-none">
        © 2025 Shakib · ProjectAlpha
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
    setDisplayedText(''); 
    const cleanedText = String(text || '').replace(/undefined/g, ''); 
    if (!cleanedText) {
      return;
    }

    let i = 0;
    const interval = setInterval(() => {
      setDisplayedText((prev = '') => prev + (cleanedText[i] || '')); 
      i++;
      if (i >= cleanedText.length) {
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return <span>{displayedText}</span>;
};

// Section component - Modified to handle multiple buttons or a single button
const Section = ({ id, title, gradientFrom, gradientTo, border, text, button, buttons }) => (
  <section
    id={id}
    className={`mb-20 rounded-xl bg-gradient-to-tr from-${gradientFrom} to-${gradientTo} p-10 shadow-xl hover:shadow-${gradientTo} transition-shadow duration-700`}
  >
    <h2 className={`text-4xl font-semibold mb-6 border-b-4 border-${border} inline-block pb-2`}>
      {title}
    </h2>
    <p className="text-slate-100 text-lg max-w-3xl leading-relaxed">{text}</p>
    {/* Increased gap to gap-10 for more space between buttons */}
    <div className="flex flex-wrap gap-10 mt-8 justify-center">
      {/* Render single button/link based on props */}
      {button && (
        button.href ? ( // If href exists, render an <a> tag
          <a
            href={button.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`px-8 py-4 bg-${button.color}-600 hover:bg-${button.color}-500 rounded-full font-semibold transition duration-300 shadow-lg shadow-${button.color}-700/50 text-lg flex items-center justify-center`}
          >
            {button.icon && <span className="mr-2">{button.icon}</span>} {/* Render icon if provided */}
            {button.label}
          </a>
        ) : ( // If only onClick exists, render a <button> tag
          <button
            onClick={button.onClick}
            className={`px-8 py-4 bg-${button.color}-600 hover:bg-${button.color}-500 rounded-full font-semibold transition duration-300 shadow-lg shadow-${button.color}-700/50 text-lg flex items-center justify-center`}
          >
            {button.icon && <span className="mr-2">{button.icon}</span>} {/* Render icon if provided */}
            {button.label}
          </button>
        )
      )}
      {/* Render multiple buttons/links */}
      {buttons && buttons.map((btn, index) => (
        <a
          key={index} // Unique key for each button in the array
          href={btn.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`px-8 py-4 bg-${btn.color}-600 hover:bg-${btn.color}-500 rounded-full font-semibold transition duration-300 shadow-lg shadow-${btn.color}-700/50 text-lg flex items-center justify-center`} // Added flex for icon alignment
        >
          {btn.icon && <span className="mr-2">{btn.icon}</span>} {/* Render icon if provided */}
          {btn.label}
        </a>
      ))}
    </div>
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
