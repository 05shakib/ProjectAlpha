// components/CourseSearch.jsx
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const CourseSearch = () => {
  const [courseCode, setCourseCode] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('CourseResults')
      .select('*')
      .ilike('course_code', `%${courseCode}%`);

    if (error) {
      console.error(error);
      setResults([]);
    } else {
      setResults(data);
    }
    setLoading(false);
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Search Course Results</h2>
      <input
        type="text"
        className="w-full p-2 border rounded"
        placeholder="Enter course code (e.g., 212)"
        value={courseCode}
        onChange={(e) => setCourseCode(e.target.value)}
      />
      <button
        className="mt-3 px-4 py-2 bg-blue-600 text-white rounded"
        onClick={handleSearch}
      >
        {loading ? 'Searching...' : 'Search'}
      </button>

      <div className="mt-6">
        {results.map((r, idx) => (
          <div key={idx} className="border p-2 rounded my-2 bg-white shadow">
            <p><strong>Student ID:</strong> {r.roll_no}</p>
            <p><strong>Course:</strong> {r.course_code}</p>
            <p><strong>Grade:</strong> {r.grade}</p>
            <p><strong>GPA:</strong> {r.gpa}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CourseSearch;
