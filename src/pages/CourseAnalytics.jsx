import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export default function CourseAnalytics() {
  const [courseCode, setCourseCode] = useState('');
  const [courseSummary, setCourseSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [overallAvgGpaCache, setOverallAvgGpaCache] = useState(null); // Cache for overall average

  const gradeToGpa = {
    'A+': 4.00, 'A': 3.75, 'A-': 3.50, 'B+': 3.25, 'B': 3.00,
    'B-': 2.75, 'C+': 2.50, 'C': 2.25, 'D': 2.00, 'F': 0.00
  };
  const gradeLabels = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'F'];

  const getGradePoint = useCallback((gradeLetter) => gradeToGpa[gradeLetter] || 0.00, [gradeToGpa]);

  // Function to calculate overall average GPA from a subset of tables
  const calculateOverallAverageGpa = useCallback(async () => {
    if (overallAvgGpaCache !== null) return overallAvgGpaCache;

    let totalPoints = 0;
    let totalCoursesCount = 0;

    const semesterTablesToSample = [];
    // Sample a few tables from different years/semesters for a representative average
    // You might want to adjust which tables to sample or how many, based on your data distribution
    const sampleTables = [
      '1121R', '1221R', '2122R', '2222R', '3123R'
      // Add more as needed, or dynamically select from Supabase if table names are in a metadata table
    ];

    try {
      const promises = sampleTables.map(tableName =>
        supabase.from(tableName).select('*')
      );
      const responses = await Promise.all(promises);

      responses.forEach(response => {
        if (response.data) {
          response.data.forEach(record => {
            // Assuming 5 courses per semester, as per previous context
            for (let i = 1; i <= 5; i++) {
                // Course codes will vary, so iterate generally over known patterns
                // This is a rough way to count all grades in these sample tables
                // In a real scenario, you'd fetch specific columns or aggregate directly
                const courseKeys = Object.keys(record).filter(key => /^\d{3}$/.test(key));
                courseKeys.forEach(courseKey => {
                    const gradeLetter = record[courseKey];
                    if (gradeLetter && gradeLetter in gradeToGpa) {
                        totalPoints += getGradePoint(gradeLetter);
                        totalCoursesCount++;
                    }
                });
            }
          });
        }
      });

      const avg = totalCoursesCount > 0 ? (totalPoints / totalCoursesCount) : 0;
      setOverallAvgGpaCache(avg); // Cache the result
      return avg;

    } catch (err) {
      console.error("Error calculating overall average GPA:", err);
      // Fallback to a default or return 0 if calculation fails
      return 0;
    }
  }, [overallAvgGpaCache, getGradePoint, gradeToGpa]);


  const handleCourseSearch = useCallback(async () => {
    setError('');
    setLoading(true);
    setCourseSummary(null);

    if (!courseCode.trim()) {
      setError('Please enter a Course Code.');
      setLoading(false);
      return;
    }

    const academicYear = parseInt(courseCode.substring(0, 1));
    const courseSemesterDigit = parseInt(courseCode.substring(1, 2));
    const courseNumber = parseInt(courseCode.substring(2, 3));

    if (isNaN(academicYear) || isNaN(courseSemesterDigit) || isNaN(courseNumber)) {
        setError('Invalid Course Code format. Expected format like "305" for 3rd year 1st semester 5th course.');
        setLoading(false);
        return;
    }

    const academicSemesterNum = courseSemesterDigit === 0 ? 1 : 2;

    const queryPromises = [];
    const resultTypes = ['R', 'I'];

    // Loop through a range of exam years to find the course
    for (let yearSuffix = 16; yearSuffix <= 30; yearSuffix++) { // Assuming exam years from 2016 to 2030
        const yearStr = String(yearSuffix).padStart(2, '0');
        const semesterPrefix = `${academicYear}${academicSemesterNum}`;
        for (const type of resultTypes) {
            const tableName = `${semesterPrefix}${yearStr}${type}`;
            // Select only the Roll no. and the specific course code column
            queryPromises.push({
                tableName: tableName,
                promise: supabase.from(tableName).select(`Roll no., "${courseCode}"`)
            });
        }
    }

    let allCourseGrades = [];
    let courseGpaSum = 0;

    try {
        const responses = await Promise.all(queryPromises.map(qp => qp.promise));
        
        responses.forEach(response => {
            if (response.data) {
                response.data.forEach(record => {
                    const gradeLetter = record[courseCode];
                    if (gradeLetter && gradeLetter in gradeToGpa) {
                        const gradePoint = getGradePoint(gradeLetter);
                        allCourseGrades.push({ studentId: record['Roll no.'], gradeLetter, gradePoint });
                        courseGpaSum += gradePoint;
                    }
                });
            }
        });

        if (allCourseGrades.length === 0) {
            setError(`No data found for Course Code: ${courseCode}. This might be because the course code is incorrect, or no students have results for it across the checked tables.`);
            setCourseSummary(null);
            return;
        }

        // Calculate Grade Distribution
        const courseGradeCounts = {};
        gradeLabels.forEach(label => courseGradeCounts[label] = 0);
        allCourseGrades.forEach(gradeInfo => {
            if (gradeInfo.gradeLetter in courseGradeCounts) {
                courseGradeCounts[gradeInfo.gradeLetter]++;
            }
        });

        const averageGpa = courseGpaSum / allCourseGrades.length;

        const overallAverageOfAllCourses = await calculateOverallAverageGpa();

        setCourseSummary({
            code: courseCode,
            totalStudents: allCourseGrades.length,
            averageGpa: averageGpa,
            courseGradeCounts: courseGradeCounts,
            overallAverageOfAllCourses: overallAverageOfAllCourses,
        });
        setError('');

    } catch (err) {
        console.error("Error fetching course data:", err);
        setError("Failed to fetch course data due to an unexpected error. Please check the Course Code or try again.");
    } finally {
        setLoading(false);
    }
  }, [courseCode, getGradePoint, calculateOverallAverageGpa, gradeToGpa, gradeLabels]);


  // Course Grade Distribution Chart Data
  const gradeDistributionChartData = courseSummary ? {
    labels: gradeLabels,
    datasets: [{
      label: `Number of Students for Course ${courseCode}`,
      data: gradeLabels.map(grade => courseSummary.courseGradeCounts[grade] || 0),
      backgroundColor: 'rgba(75, 192, 192, 0.7)',
      borderColor: 'rgba(75, 192, 192, 1)',
      borderWidth: 1,
    }]
  } : null;

  // Course GPA vs. Overall Average Chart Data
  const courseVsOverallAverageChartData = courseSummary ? {
    labels: ['Selected Course Average', 'Overall Average of All Courses'],
    datasets: [{
      label: 'Average GPA',
      data: [courseSummary.averageGpa.toFixed(2), courseSummary.overallAverageOfAllCourses.toFixed(2)],
      backgroundColor: ['#007bff', '#28a745'], // Blue for course, Green for overall
      borderColor: ['#007bff', '#28a745'],
      borderWidth: 1,
    }]
  } : null;

  return (
    <section className="min-h-screen bg-gray-900 text-white p-6 md:p-12">
      <h1 className="text-4xl font-extrabold text-center mb-10 text-green-400">
        Course Analytics Dashboard
      </h1>

      {error && (
        <div className="bg-red-500 text-white p-4 rounded-lg mb-6 text-center">
          {error}
        </div>
      )}

      <div className="bg-gray-800 rounded-xl p-8 shadow-xl border border-green-600">
        <h2 className="text-3xl font-bold mb-6 text-green-300">Course Data Analysis</h2>
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-8">
          <input
            type="text"
            placeholder="Enter Course Code (e.g., 305)"
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
            <p className="text-lg text-gray-200">Total Students Graded: <span className="font-bold">{courseSummary.totalStudents}</span></p>
            <p className="text-lg text-gray-200">Average GPA for Course: <span className="font-bold">{courseSummary.averageGpa.toFixed(2)}</span></p>

            {/* Course GPA vs Overall Average Chart */}
            {courseVsOverallAverageChartData && (
              <div className="bg-gray-700 p-6 rounded-lg shadow-md mb-8">
                <h4 className="text-xl font-semibold mb-4 text-white">Course GPA vs. Overall Average</h4>
                <div className="w-full md:w-2/3 mx-auto">
                  <Bar data={courseVsOverallAverageChartData} options={{
                      responsive: true,
                      plugins: {
                          legend: {
                              display: false,
                              labels: { color: 'white' }
                          },
                          title: {
                              display: false,
                          },
                      },
                      scales: {
                          x: { ticks: { color: 'white' } },
                          y: { ticks: { color: 'white' }, beginAtZero: true, max: 4.0 }
                      }
                  }} />
                </div>
              </div>
            )}

            {/* Grade Distribution Chart */}
            {gradeDistributionChartData && (
              <div className="bg-gray-700 p-6 rounded-lg shadow-md mb-8">
                <h4 className="text-xl font-semibold mb-4 text-white">Grade Distribution for {courseCode}</h4>
                <div className="w-full md:w-2/3 mx-auto">
                  <Bar data={gradeDistributionChartData} options={{
                      responsive: true,
                      plugins: {
                          legend: { labels: { color: 'white' } },
                          title: { display: false },
                      },
                      scales: {
                          x: { ticks: { color: 'white' } },
                          y: { ticks: { color: 'white' }, beginAtZero: true, suggestedMax: courseSummary.totalStudents + 5 }
                      }
                  }} />
                </div>
              </div>
            )}

            {/* Grade Distribution Table */}
            <div className="bg-gray-700 p-6 rounded-lg shadow-md">
              <h4 className="text-xl font-semibold mb-4 text-white">Grade Count & Percentage</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto text-left text-sm">
                  <thead className="bg-gray-600">
                    <tr>
                      <th className="px-4 py-2 text-gray-200">Grade</th>
                      <th className="px-4 py-2 text-gray-200">Count</th>
                      <th className="px-4 py-2 text-gray-200">Percentage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-600">
                    {gradeLabels.map(grade => {
                      const count = courseSummary.courseGradeCounts[grade] || 0;
                      const percentage = courseSummary.totalStudents > 0
                        ? ((count / courseSummary.totalStudents) * 100).toFixed(2)
                        : 0;
                      return (
                        <tr key={grade} className="hover:bg-gray-600 transition-colors duration-200">
                          <td className="px-4 py-2 text-gray-100">{grade}</td>
                          <td className="px-4 py-2 text-gray-100">{count}</td>
                          <td className="px-4 py-2 text-gray-100">{percentage}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-gray-400 text-center py-4">Enter a Course Code and click "Show Course Data" to view analytics.</p>
        )}
      </div>
    </section>
  );
}