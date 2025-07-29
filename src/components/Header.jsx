import React from 'react';
import { NavLink } from 'react-router-dom';
import './Header.css'; // Import the new CSS file

const Header = () => {
  return (
    <header className="header-container">
      {/* ProjectAlpha Title - Now at the beginning (left) of the header */}
      <div className="project-alpha-title">
        <NavLink to="/" className="project-alpha-title-link">
          ProjectAlpha
        </NavLink>
      </div>

      {/* Navigation List - Horizontal */}
      <ul className="nav-list">
        <li>
          <NavLink
            to="/"
            className={({ isActive }) =>
              `nav-link ${isActive ? 'active' : ''}`
            }
            end
          >
            Home
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/projects"
            className={({ isActive }) =>
              `nav-link ${isActive ? 'active' : ''}`
            }
          >
            Project
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/result-analysis"
            className={({ isActive }) =>
              `nav-link ${isActive ? 'active' : ''}`
            }
          >
            Student Analytics
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/course-analytics"
            className={({ isActive }) =>
              `nav-link ${isActive ? 'active' : ''}`
            }
          >
            Course Analytics
          </NavLink>
        </li>
      </ul>
    </header>
  );
};

export default Header;
