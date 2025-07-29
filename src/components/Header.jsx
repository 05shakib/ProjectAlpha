// src/components/Header.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';

const Header = () => {
  return (
    <header className="fixed top-0 left-0 right-0 bg-gradient-to-r from-indigo-900 via-blue-900 to-black text-white shadow-md z-50">
      <nav className="max-w-6xl mx-auto flex justify-between items-center p-4">
        <div className="text-2xl font-bold tracking-wide cursor-pointer">
          <NavLink to="/" className="hover:text-indigo-400">ProjectAlpha</NavLink>
        </div>
        <ul className="flex space-x-8 text-lg">
          <li>
            <NavLink
              to="/"
              className={({ isActive }) =>
                isActive ? 'text-indigo-400 font-semibold' : 'hover:text-indigo-300'
              }
              end
            >
              About Me
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/projects"
              className={({ isActive }) =>
                isActive ? 'text-indigo-400 font-semibold' : 'hover:text-indigo-300'
              }
            >
              Project
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/result-analysis"
              className={({ isActive }) =>
                isActive ? 'text-indigo-400 font-semibold' : 'hover:text-indigo-300'
              }
            >
              Result Analysis
            </NavLink>
          </li>
        </ul>
      </nav>
    </header>
  );
};

export default Header;
