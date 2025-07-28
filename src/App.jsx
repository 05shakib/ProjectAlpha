import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Projects from './pages/Projects';
import ResultAnalysis from './pages/ResultAnalysis';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/analysis" element={<ResultAnalysis />} />
      </Routes>
    </Router>
  );
}
