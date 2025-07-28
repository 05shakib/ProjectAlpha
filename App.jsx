import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Landing from './pages/Landing';
import Projects from './pages/Projects';
import ResultAnalysis from './pages/ResultAnalysis';

export default function App() {
  return (
    <Router>
      <header className="bg-blue-800 text-white p-4">
        <nav className="container mx-auto flex space-x-6">
          <Link to="/" className="hover:underline">About Me</Link>
          <Link to="/projects" className="hover:underline">Projects</Link>
          <Link to="/result-analysis" className="hover:underline">Result Analysis</Link>
        </nav>
      </header>

      <main className="container mx-auto p-6">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/result-analysis" element={<ResultAnalysis />} />
        </Routes>
      </main>
    </Router>
  );
}
