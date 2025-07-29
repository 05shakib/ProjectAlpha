import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Home from './pages/Home'; // Assuming you have a Home page
import ResultAnalysis from './pages/ResultAnalysis';
import CourseAnalytics from './pages/CourseAnalytics'; // Import the new CourseAnalytics component
import Project from './components/Project'; // Assuming this is a standalone Project component
import AboutMe from './components/AboutMe'; // Assuming this is a standalone AboutMe component

import './App.css'; // Keep existing global styles
import './index.css'; // Keep existing global styles


function App() {
  const [activeLink, setActiveLink] = useState(window.location.pathname);

  const handleNavLinkClick = (path) => {
    setActiveLink(path);
  };

  return (
    <Router>
      <div className="flex flex-col min-h-screen">
        {/* Navigation Header */}
        <header className="bg-gray-800 text-white p-4 shadow-lg">
          <nav className="container mx-auto flex justify-between items-center">
            <Link to="/" className="text-2xl font-bold text-blue-400 hover:text-blue-300 transition duration-300">
              ProjectAlpha
            </Link>
            <ul className="flex space-x-6">
              <li>
                <Link
                  to="/about-me"
                  onClick={() => handleNavLinkClick('/about-me')}
                  className={`text-lg font-medium hover:text-blue-300 transition duration-300 ${activeLink === '/about-me' ? 'text-blue-300 border-b-2 border-blue-300' : 'text-gray-300'}`}
                >
                  About Me
                </Link>
              </li>
              <li>
                <Link
                  to="/projects"
                  onClick={() => handleNavLinkClick('/projects')}
                  className={`text-lg font-medium hover:text-blue-300 transition duration-300 ${activeLink === '/projects' ? 'text-blue-300 border-b-2 border-blue-300' : 'text-gray-300'}`}
                >
                  Project
                </Link>
              </li>
              <li>
                <Link
                  to="/result-analysis"
                  onClick={() => handleNavLinkClick('/result-analysis')}
                  className={`text-lg font-medium hover:text-blue-300 transition duration-300 ${activeLink === '/result-analysis' ? 'text-blue-300 border-b-2 border-blue-300' : 'text-gray-300'}`}
                >
                  Student Analytics
                </Link>
              </li>
              <li>
                {/* New link for Course Analytics */}
                <Link
                  to="/course-analytics"
                  onClick={() => handleNavLinkClick('/course-analytics')}
                  className={`text-lg font-medium hover:text-blue-300 transition duration-300 ${activeLink === '/course-analytics' ? 'text-blue-300 border-b-2 border-blue-300' : 'text-gray-300'}`}
                >
                  Course Analytics
                </Link>
              </li>
            </ul>
          </nav>
        </header>

        {/* Main Content Area */}
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about-me" element={<AboutMe />} /> {/* Assuming AboutMe is a page */}
            <Route path="/projects" element={<Project />} /> {/* Assuming Project is a page */}
            <Route path="/result-analysis" element={<ResultAnalysis />} />
            <Route path="/course-analytics" element={<CourseAnalytics />} /> {/* New Route */}
            {/* Add other routes as necessary based on your project structure (e.g., Dashboard, Landing) */}
            {/* Example: <Route path="/dashboard" element={<Dashboard />} /> */}
            {/* Example: <Route path="/landing" element={<Landing />} /> */}
          </Routes>
        </main>

        {/* Optional: Footer */}
        {/* <footer className="bg-gray-800 text-white p-4 text-center mt-auto">
          <p>&copy; {new Date().getFullYear()} ProjectAlpha. All rights reserved.</p>
        </footer> */}
      </div>
    </Router>
  );
}

export default App;