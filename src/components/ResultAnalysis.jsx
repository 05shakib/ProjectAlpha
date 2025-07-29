import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient'; // Ensure this path is correct
import ResultTrendChart from '../components/ResultTrendChart'; // Assuming ResultTrendChart is the preferred one
import ChartRenderer from '../components/ChartRenderer'; // For general chart rendering


const gradeToGpa = {
  'A+': 4.00, 'A': 4.00, 'A-': 3.70, 'B+': 3.30, 'B': 3.00,
  'B-': 2.70, 'C+': 2.30, 'C': 2.00, 'D': 1.00, 'F': 0.00
};

export default function ResultAnalysis() {
  const [activeTab, setActiveTab] = useState('student');
  const [studentId, setStudentId] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [studentData, setStudentData] = useState(null);
  const [courseSummary, setCourseSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStudentSearch = async () => {
    setError('');
    setLoading(true);
    setStudentData(null); // Clear previous data

    if (!studentId.trim()) {
      setError('Please enter a Student ID.');
      setLoading(false);
      return;
    }

    const queryPromises = [];
    const studentResults = [];

    // Loop through 8 semesters for multiple sessions
    for (let y = 1; y <= 4; y++) {
      for (let s = 1; s <= 2; s++) {
        const semester = `${y}${s}`;
        const sessions = ['22', '23', '24', '25', '26']; // Example sessions, adjust as per your data

        for (let session of sessions) {
          const table = `${semester}${session}R`; // Construct table name, e.g., '1122R'
          queryPromises.push(
            supabase.from(table).select('*').eq('Roll', studentId)
          );
        }
      }
    }

    try {
      const responses = await Promise.all(queryPromises);
      responses.forEach(response => {
        if (response.data && response.data.length > 0) {
          studentResults.push(...response.data);
        }
      });

      if (studentResults.length > 0) {
        // Process fetched studentResults into the desired format for rendering
        const processedData = studentResults.map(res => ({
            Semester: res.Semester || 'N/A', // Assuming a 'Semester' column in your Supabase tables
            GPA: res.GPA || 0, // Assuming a 'GPA' column
            CGPA: res.CGPA || null, // Assuming a 'CGPA' column
            Details: res.Subjects || [] // Assuming a 'Subjects' column with subject details
        }));
        setStudentData(processedData);
      } else {
        setError(`No data found for Student ID: ${studentId}`);
      }
    } catch (err) {
      console.error("Error fetching student data:", err);
      setError("Failed to fetch student data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCourseSearch = async () => {
    setError('');
    setLoading(true);
    setCourseSummary(null); // Clear previous data

    if (!courseCode.trim()) {
      setError('Please enter a Course Code.');
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('CourseResults') // Assuming you have a 'CourseResults' table
        .select('*')
        .ilike('course_code', `%${courseCode}%`);

      if (fetchError) {
        console.error("Error fetching course data:", fetchError);
        setError("Failed to fetch course data. Please try again.");
        setCourseSummary(null);
      } else if (data && data.length > 0) {
        // Process course data for summary, e.g., calculate average grade, student list
        const summary = {
          code: courseCode,
          totalStudents: data.length,
          results: data, // Keep raw results for now
          // You might calculate average GPA for the course here
        };
        setCourseSummary(summary);
      } else {
        setError(`No data found for Course Code: ${courseCode}`);
      }
    } catch (err) {
      console.error("Error fetching course data:", err);
      setError("Failed to fetch course data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const studentGpaData = studentData ? {
    labels: studentData.map(d => d.Semester),
    datasets: [{
      label: 'GPA',
      data: studentData.map(d => d.GPA),
      borderColor: 'rgb(75, 192, 192)',
      tension: 0.1,
      fill: false,
    }, {
      label: 'CGPA',
      data: studentData.map(d => d.CGPA),
      borderColor: 'rgb(153, 102, 255)',
      tension: 0.1,
      fill: false,
    }]
  } : null;

  return (
    <section className="min-h-screen bg-gray-900 text-white p-6 md:p-12">
      <h1 className="text-4xl font-extrabold text-center mb-10 text-blue-400">
        Result Analysis Dashboard
      </h1>

      <div className="flex justify-center mb-8">
        <button
          onClick={() => setActiveTab('student')}
          className={`px-8 py-3 text-lg font-semibold rounded-l-lg transition-all duration-300 ${
            activeTab === 'student'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Student Analytics
        </button>
        <button
          onClick={() => setActiveTab('course')}
          className={`px-8 py-3 text-lg font-semibold rounded-r-lg transition-all duration-300 ${
            activeTab === 'course'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Course Analytics
        </button>
      </div>

      {error && (
        <div className="bg-red-500 text-white p-4 rounded-lg mb-6 text-center">
          {error}
        </div>
      )}

      {/* Student Analytics Tab */}
      {activeTab === 'student' && (
        <div className="bg-gray-800 rounded-xl p-8 shadow-xl border border-blue-600">
          <h2 className="text-3xl font-bold mb-6 text-blue-300">Student Analytics</h2>
          <div className="flex flex-col sm:flex-row items-center gap-4 mb-8">
            <input
              type="text"
              placeholder="Enter Student ID (e.g., 2112535162)"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="flex-grow px-5 py-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-blue-500 placeholder-gray-400"
            />
            <button
              onClick={handleStudentSearch}
              disabled={loading}
              className="w-full sm:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Searching...' : 'Show Student Data'}
            </button>
          </div>

          {studentData && studentData.length > 0 ? (
            <div className="mt-8 space-y-8">
              <h3 className="text-2xl font-semibold mb-4 text-white">Student Results Overview</h3>
              <div className="overflow-x-auto bg-gray-700 rounded-lg shadow-md">
                <table className="min-w-full table-auto text-left">
                  <thead className="bg-gray-600">
                    <tr>
                      <th className="px-6 py-3 text-sm font-medium text-gray-200 uppercase tracking-wider">Semester</th>
                      <th className="px-6 py-3 text-sm font-medium text-gray-200 uppercase tracking-wider">GPA</th>
                      <th className="px-6 py-3 text-sm font-medium text-gray-200 uppercase tracking-wider">CGPA</th>
                      <th className="px-6 py-3 text-sm font-medium text-gray-200 uppercase tracking-wider">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-600">
                    {studentData.map((s, index) => (
                      <tr key={index} className="hover:bg-gray-600 transition-colors duration-200">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-100">{s.Semester}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-100">{s.GPA.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-100">{s.CGPA ? s.CGPA.toFixed(2) : '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-100">
                          {s.Details && s.Details.map((detail, idx) => (
                            <span key={idx} className="block">{detail.code}: {detail.grade}</span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {studentGpaData && (
                <ResultTrendChart
                  labels={studentGpaData.labels}
                  datasets={studentGpaData.datasets}
                  title="Student GPA/CGPA Trend"
                />
              )}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">Enter a Student ID and click "Show Student Data" to view results.</p>
          )}
        </div>
      )}

      {/* Course Analytics Tab */}
      {activeTab === 'course' && (
        <div className="bg-gray-800 rounded-xl p-8 shadow-xl border border-green-600">
          <h2 className="text-3xl font-bold mb-6 text-green-300">Course Analytics</h2>
          <div className="flex flex-col sm:flex-row items-center gap-4 mb-8">
            <input
              type="text"
              placeholder="Enter Course Code (e.g., MKT101)"
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              className="flex-grow px-5 py-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-green-500 placeholder-gray-400"
            />
            <button
              onClick={handleCourseSearch}
              disabled={loading}
              className="w-full sm:w-auto px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Searching...' : 'Show Course Data'}
            </button>
          </div>

          {courseSummary ? (
            <div className="mt-8 space-y-6">
              <h3 className="text-2xl font-semibold text-white">Summary for Course: <span className="text-green-300">{courseSummary.code}</span></h3>
              <p className="text-lg text-gray-200">Total Students: <span className="font-bold">{courseSummary.totalStudents}</span></p>

              <div className="overflow-x-auto bg-gray-700 rounded-lg shadow-md">
                <table className="min-w-full table-auto text-left">
                  <thead className="bg-gray-600">
                    <tr>
                      <th className="px-6 py-3 text-sm font-medium text-gray-200 uppercase tracking-wider">Student ID</th>
                      <th className="px-6 py-3 text-sm font-medium text-gray-200 uppercase tracking-wider">Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-600">
                    {courseSummary.results.map((r, index) => (
                      <tr key={index} className="hover:bg-gray-600 transition-colors duration-200">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-100">{r.id}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-100">{r.grade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">Enter a Course Code and click "Show Course Data" to view analytics.</p>
          )}
        </div>
      )}
    </section>
  );
}