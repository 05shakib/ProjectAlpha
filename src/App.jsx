import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Landing from './pages/Landing';
import Projects from './pages/Projects';
import ResultAnalysis from './pages/ResultAnalysis';
import CourseAnalytics from './pages/CourseAnalytics';

import './App.css'; // Keep this for any general app styles
import './index.css'; // Keep this for any global base styles

function App() {
  return (
    <Router>
      <div className="flex flex-col min-h-screen">
        <Header />

        {/* Main Content Area - Use CSS variable for padding-top */}
        <main className="flex-grow" style={{ paddingTop: 'var(--header-height)' }}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/result-analysis" element={<ResultAnalysis />} />
            <Route path="/course-analytics" element={<CourseAnalytics />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
