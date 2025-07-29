// src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Header from './components/Header.jsx';
import Landing from './pages/Landing.jsx';
import Project from './pages/Projects.jsx';
import ResultAnalysis from './pages/ResultAnalysis.jsx';

const App = () => {
  return (
    <Router>
      <Header />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/projects" element={<Project />} />
        <Route path="/result-analysis" element={<ResultAnalysis />} />
      </Routes>
    </Router>
  );
};

export default App;
