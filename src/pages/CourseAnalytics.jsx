import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Bar } from 'react-chartjs-2';
// Remove direct ChartJS imports and registration from here
// import {
//   Chart as ChartJS,
//   CategoryScale,
//   LinearScale,
//   BarElement,
//   Title,
//   Tooltip,
//   Legend,
// } from 'chart.js';

// ChartJS.register(
//   CategoryScale,
//   LinearScale,
//   BarElement,
//   Title,
//   Tooltip,
//   Legend
// );

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
            queryPromises.push({ tableName: tableName, promise: supabase.from(tableName).select(`Roll no., "${courseCode}"`) });
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
      allCourseGrades.forEach(g => {
        if (g.gradeLetter in courseGradeCounts) {
          courseGradeCounts[g.gradeLetter]++;
        }
      });

      const gradeDistributionData = gradeLabels.map(label => courseGradeCounts[label]);

      const avgGpa = allCourseGrades.length > 0 ? (courseGpaSum / allCourseGrades.length) : 0;

      // Get overall average GPA
      const overallAvg = await calculateOverallAverageGpa();


      setCourseSummary({
        courseCode: courseCode,
        totalStudents: allCourseGrades.length,
        averageGpa: avgGpa.toFixed(2),
        overallAverageGpa: overallAvg.toFixed(2),
        gradeDistribution: {
          labels: gradeLabels,
          datasets: [{
            label: 'Number of Students',
            data: gradeDistributionData,
            backgroundColor: 'rgba(75, 192, 192, 0.6)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1,
          }],
        },
        students: allCourseGrades,
      });

    } catch (err) {
      console.error("Error fetching course results:", err);
      setError('Failed to fetch course results. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [courseCode, getGradePoint, gradeLabels, calculateOverallAverageGpa]);

  useEffect(() => {
    // Pre-calculate and cache overall average GPA on component mount
    calculateOverallAverageGpa();
  }, [calculateOverallAverageGpa]);

  return (
    <div className="container mx-auto p-4 pt-16 text-white">
      <h1 className="text-3xl font-bold mb-6 text-center">Course Analytics</h1>

      <div className="bg-gray-800 p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-2xl font-semibold mb-4">Search Course Results</h2>
        <div className="flex items-center space-x-4">
          <input
            type="text"
            placeholder="Enter Course Code (e.g., 305)"
            className="p-3 border border-gray-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex-grow"
            value={courseCode}
            onChange={(e) => setCourseCode(e.target.value)}
          />
          <button
            onClick={handleCourseSearch}
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          >
            {loading ? 'Searching...' : 'Search Course'}
          </button>
        </div>
        {error && <p className="text-red-500 mt-4">{error}</p>}
      </div>

      {courseSummary && (
        <div className="bg-gray-800 p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold mb-4 text-center">Summary for {courseSummary.courseCode}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-gray-700 p-4 rounded-md text-center">
              <p className="text-lg font-medium">Total Students Enrolled:</p>
              <p className="text-4xl font-bold text-blue-400">{courseSummary.totalStudents}</p>
            </div>
            <div className="bg-gray-700 p-4 rounded-md text-center">
              <p className="text-lg font-medium">Average GPA for this Course:</p>
              <p className="text-4xl font-bold text-green-400">{courseSummary.averageGpa}</p>
            </div>
             <div className="bg-gray-700 p-4 rounded-md text-center md:col-span-2">
              <p className="text-lg font-medium">Overall Average GPA (Sampled):</p>
              <p className="text-4xl font-bold text-purple-400">{courseSummary.overallAverageGpa}</p>
            </div>
          </div>

          <h3 className="text-xl font-semibold mb-4 text-center">Grade Distribution</h3>
          {courseSummary.gradeDistribution && (
            <div className="w-full md:w-3/4 mx-auto mb-8">
              <Bar data={courseSummary.gradeDistribution} options={{
                responsive: true,
                plugins: {
                  legend: {
                    position: 'top',
                    labels: {
                      color: 'white',
                    },
                  },
                  title: {
                    display: true,
                    text: 'Grade Distribution for ' + courseSummary.courseCode,
                    color: 'white',
                    font: {
                      size: 18,
                    },
                  },
                },
                scales: {
                  x: {
                    title: {
                      display: true,
                      text: 'Grade',
                      color: 'white',
                    },
                    ticks: {
                      color: 'white',
                    },
                    grid: {
                      color: 'rgba(255, 255, 255, 0.1)',
                    },
                  },
                  y: {
                    title: {
                      display: true,
                      text: 'Number of Students',
                      color: 'white',
                    },
                    ticks: {
                      color: 'white',
                      precision: 0,
                    },
                    grid: {
                      color: 'rgba(255, 255, 255, 0.1)',
                    },
                  },
                },
              }} />
            </div>
          )}

          <h3 className="text-xl font-semibold mb-4 text-center">Student Grades in {courseSummary.courseCode}</h3>
          {courseSummary.students && courseSummary.students.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-gray-700 rounded-lg text-left text-white">
                <thead>
                  <tr>
                    <th className="py-3 px-4 border-b border-gray-600">Student ID</th>
                    <th className="py-3 px-4 border-b border-gray-600">Grade</th>
                    <th className="py-3 px-4 border-b border-gray-600">GPA Equivalent</th>
                  </tr>
                </thead>
                <tbody>
                  {courseSummary.students.map((student, index) => (
                    <tr key={index} className="hover:bg-gray-600">
                      <td className="py-2 px-4 border-b border-gray-600">{student.studentId}</td>
                      <td className="py-2 px-4 border-b border-gray-600">{student.gradeLetter}</td>
                      <td className="py-2 px-4 border-b border-gray-600">{student.gradePoint.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-gray-400">No individual student grades to display for this course.</p>
          )}
        </div>
      )}
    </div>
  );
}