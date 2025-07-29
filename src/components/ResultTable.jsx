import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient'; // Ensure correct path

export default function ResultTable() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true);
      setError('');
      try {
        // IMPORTANT: Replace '1121R' with the specific table or view
        // that aggregates the results you want to display in this general table.
        // If you need data from multiple semester tables, you'll need to adapt this logic
        // (e.g., fetch from each table and combine, or create a Supabase View).
        const { data, error } = await supabase
          .from('1121R') // Example: Fetching from 1st Year 1st Semester 2021 Regular
          .select('Roll, Semester, GPA, CGPA'); // Adjust column names as per your table structure

        if (error) {
          throw error;
        }
        setResults(data);
      } catch (err) {
        console.error("Error fetching results:", err.message);
        setError("Failed to load results. Please ensure the table exists and data is available.");
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, []);

  if (loading) {
    return <div className="text-center text-gray-400 py-8">Loading results...</div>;
  }

  if (error) {
    return <div className="text-center text-red-500 py-8">Error: {error}</div>;
  }

  if (results.length === 0) {
    return <div className="text-center text-gray-400 py-8">No results to display.</div>;
  }

  return (
    <div className="overflow-x-auto bg-gray-800 rounded-lg shadow-xl border border-gray-700">
      <table className="min-w-full table-auto text-left divide-y divide-gray-700">
        <thead className="bg-gray-700">
          <tr>
            <th className="px-6 py-3 text-sm font-medium text-gray-300 uppercase tracking-wider">Student Roll</th>
            <th className="px-6 py-3 text-sm font-medium text-gray-300 uppercase tracking-wider">Semester</th>
            <th className="px-6 py-3 text-sm font-medium text-gray-300 uppercase tracking-wider">GPA</th>
            <th className="px-6 py-3 text-sm font-medium text-gray-300 uppercase tracking-wider">CGPA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
          {results.map((s, i) => (
            <tr key={i} className="hover:bg-gray-700 transition-colors duration-200">
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-100">{s.Roll}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-100">{s.Semester}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-100">{s.GPA.toFixed(2)}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-100">{s.CGPA ? s.CGPA.toFixed(2) : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}