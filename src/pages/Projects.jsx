import React from 'react';
import { Link } from 'react-router-dom'; // Import Link for internal navigation

export default function Projects() {
  return (
    <section className="container mx-auto p-4 pt-16 text-white">
      <h1 className="text-3xl font-bold mb-6 text-center">My Projects</h1>
      <ul className="list-disc pl-6 space-y-4 text-lg">
        <li className="flex flex-col md:flex-row md:items-center md:space-x-4 space-y-2 md:space-y-0">
          <strong className="text-blue-400">ProjectAlpha</strong>: A web app for university result analysis with dynamic charts and analytics. (All data collected from publicly available sources. Secondary data formation was not reuse-friendly, so there are some issues.)
          <Link
            to="https://project-alpha-nu.vercel.app/" // Assuming /result-analysis is the route for ProjectAlpha
            className="inline-block mt-2 md:mt-0 px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
          >
            Open ProjectAlpha
          </Link>
        </li>
		<li>
          
        </li>
        <li>
          
        </li>
        <li className="flex flex-col md:flex-row md:items-center md:space-x-4 space-y-2 md:space-y-0">
          <strong className="text-blue-400">MKT 25th Batch Results</strong>: A static webpage with preloaded data for result analysis with dynamic charts and analytics. (All data collected from publicly available sources. Secondary data formation was not reuse-friendly, so there are some issues.)
          <a
            href="/staticproject.html" // Assuming staticproject.html is in the public folder
            target="_blank" // Opens in a new tab
            rel="noopener noreferrer" // Security best practice for target="_blank"
            className="inline-block mt-2 md:mt-0 px-4 py-2 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors duration-200"
          >
            Open Static Page
          </a>
        </li>
        <li>
          <strong className="text-blue-400"></strong>
        </li>
        <li>
          <strong className="text-blue-400"></strong>
        </li>
      </ul>
    </section>
  );
}
