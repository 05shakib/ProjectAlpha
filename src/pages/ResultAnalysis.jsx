import { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

const gradeToGpa = {
  'A+': 4.00, 'A': 4.00, 'A-': 3.70, 'B+': 3.30, 'B': 3.00,
  'B-': 2.70, 'C+': 2.30, 'C': 2.00, 'D': 1.00, 'F': 0.00
};

// Your semesterData, studentNames, and utility functions here (import from separate files in a real app)
const semesterData = {
  '1st Year 1st Semester 2021': {
    '2112535162': ['A+', 'B+', 'A', 'A-', 'A-'],
    '2112535216': ['A-', 'C+', 'B', 'B+', 'A'],
    '2112535218': ['A-', 'A-', 'A', 'A-', 'A-']
  },
  // ... rest of the data ...
};
const studentNames = {};
for (const sem in semesterData) {
  for (const id in semesterData[sem]) studentNames[id] = `Student ${id}`;
}

// Utility functions like getSubjectCodesForSemester(), calculateSemesterGpa(), calculateCgpa() etc. should be here or imported

export default function ResultAnalysis() {
  const [studentId, setStudentId] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [studentResult, setStudentResult] = useState(null);
  const [courseResult, setCourseResult] = useState(null);
  const [activeTab, setActiveTab] = useState('student');

  const chartsRef = useRef({}); // Store chart instances

  // Clear charts helper
  function clearCharts() {
    Object.values(chartsRef.current).forEach(chart => chart.destroy());
    chartsRef.current = {};
  }

  // Event handlers
  function handleStudentSearch() {
    clearCharts();
    // Validate studentId & compute result dynamically...
    // Set studentResult with processed data for rendering.
    // (Use your existing logic here adapted for React)
    // For brevity, just dummy example:
    if (!studentId.trim()) {
      setStudentResult({ error: 'Please enter a Student ID.' });
      return;
    }
    // Check if student exists:
    const exists = Object.values(semesterData).some(sem => sem[studentId.trim()]);
    if (!exists) {
      setStudentResult({ error: `No data found for Student ID: ${studentId.trim()}` });
      return;
    }
    // Prepare studentResult data object here...
    // Example: setStudentResult({ id: studentId.trim(), name: studentNames[studentId.trim()], semesters: {...} })
    // For now, simple placeholder:
    setStudentResult({ id: studentId.trim(), name: studentNames[studentId.trim()] || `Student ${studentId.trim()}`, semesters: {} });
  }

  function handleCourseSearch() {
    clearCharts();
    if (!courseCode.trim()) {
      setCourseResult({ error: 'Please enter a Course Code.' });
      return;
    }
    // Prepare courseResult similar to studentResult, based on your course data logic
    setCourseResult({ code: courseCode.trim(), summary: 'Data to be implemented...' });
  }

  // Chart rendering logic using useEffect and refs can be added here based on studentResult and courseResult data

  return (
    <section>
      <h1 className="text-3xl font-bold mb-6">Result Analysis Dashboard</h1>

      <div className="mb-6">
        <button
          className={`px-4 py-2 mr-3 rounded ${activeTab === 'student' ? 'bg-blue-600 text-white' : 'bg-gray-300'}`}
          onClick={() => setActiveTab('student')}
        >
          Student Analytics
        </button>
        <button
          className={`px-4 py-2 rounded ${activeTab === 'course' ? 'bg-blue-600 text-white' : 'bg-gray-300'}`}
          onClick={() => setActiveTab('course')}
        >
          Course Analytics
        </button>
      </div>

      {activeTab === 'student' && (
        <div>
          <label className="font-semibold mr-2" htmlFor="studentIdInput">Enter Student ID:</label>
          <input
            id="studentIdInput"
            type="text"
            value={studentId}
            onChange={e => setStudentId(e.target.value)}
            placeholder="e.g. 2112535162"
            className="border rounded p-1 mr-2"
          />
          <button
            onClick={handleStudentSearch}
            className="bg-green-600 text-white px-4 py-1 rounded hover:bg-green-700"
          >
            Show Student Data
          </button>

          <div className="mt-6" id="student-data">
            {studentResult ? (
              studentResult.error ? (
                <p className="text-red-600 font-semibold">{studentResult.error}</p>
              ) : (
                <pre>{JSON.stringify(studentResult, null, 2)}</pre>
                /* Here, replace with detailed JSX rendering of the studentResult with tables/charts */
              )
            ) : (
              <p className="italic">Enter a Student ID to see results.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'course' && (
        <div>
          <label className="font-semibold mr-2" htmlFor="courseCodeInput">Enter Course Code:</label>
          <input
            id="courseCodeInput"
            type="text"
            value={courseCode}
            onChange={e => setCourseCode(e.target.value)}
            placeholder="e.g. 101"
            className="border rounded p-1 mr-2"
          />
          <button
            onClick={handleCourseSearch}
            className="bg-green-600 text-white px-4 py-1 rounded hover:bg-green-700"
          >
            Show Course Data
          </button>

          <div className="mt-6" id="course-data">
            {courseResult ? (
              courseResult.error ? (
                <p className="text-red-600 font-semibold">{courseResult.error}</p>
              ) : (
                <pre>{JSON.stringify(courseResult, null, 2)}</pre>
                /* Replace with detailed course analytics UI */
              )
            ) : (
              <p className="italic">Enter a Course Code to see analytics.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
