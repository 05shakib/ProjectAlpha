import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Bar } from 'react-chartjs-2';
import {
  COURSE_CREDITS,
  COURSES_PER_SEMESTER,
  fetchExistingTableNames,
  getSubjectCodesForAcademicSemester,
  getGradePoint,
  gradeToGpa // Import gradeToGpa for consistency
} from '../lib/dataUtils';

export default function CourseAnalytics() {
  const [courseCode, setCourseCode] = useState('');
  const [courseSummary, setCourseSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [overallAvgGpaCache, setOverallAvgGpaCache] = useState(null); // Cache for overall average

  // Define grade labels in the desired order
  const gradeLabels = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'F'];

  // Function to calculate overall average GPA from all available data
  const calculateOverallAverageGpa = useCallback(async () => {
    if (overallAvgGpaCache !== null) return overallAvgGpaCache; // Use cached value if available

    let totalPoints = 0;
    let totalCoursesCount = 0;

    try {
      // Fetch all existing table names from the metadata table
      const allExistingTablesMetadata = await fetchExistingTableNames();
      const allQueryPromises = [];

      allExistingTablesMetadata.forEach(meta => {
        const subjectCodesForTable = getSubjectCodesForAcademicSemester(meta.academic_year, meta.academic_semester);
        // Ensure subjectCodesForTable only contains valid strings
        const filteredSubjectCodesForTable = subjectCodesForTable.filter(code => typeof code === 'string' && code.length > 0);

        // Select all relevant course columns for each table
        const selectColumnsForTable = filteredSubjectCodesForTable.map(code => `"${code}"`);
        if (selectColumnsForTable.length > 0) { // Only push if there are columns to select
            allQueryPromises.push(
                supabase.from(meta.table_name).select(selectColumnsForTable.join(','))
            );
        }
      });

      const responses = await Promise.allSettled(allQueryPromises);

      responses.forEach(response => {
        if (response.status === 'fulfilled' && response.value.data) {
          response.value.data.forEach(record => {
            Object.values(record).forEach(gradeLetter => {
              if (typeof gradeLetter === 'string' && gradeLetter in gradeToGpa) {
                totalPoints += getGradePoint(gradeLetter);
                totalCoursesCount++;
              }
            });
          });
        } else if (response.status === 'rejected') {
          console.error("Error fetching data for overall average GPA:", response.reason);
        }
      });

      const avg = totalCoursesCount > 0 ? (totalPoints / totalCoursesCount) : 0;
      setOverallAvgGpaCache(parseFloat(avg.toFixed(3))); // Cache the result, fixed to 3 decimal places
      return parseFloat(avg.toFixed(3));

    } catch (err) {
      console.error("Unexpected error calculating overall average GPA:", err);
      return 0.000;
    }
  }, [overallAvgGpaCache]);


  const handleCourseSearch = useCallback(async () => {
    setError('');
    setLoading(true);
    setCourseSummary(null);

    if (!courseCode.trim()) {
      setError('Please enter a Course Code.');
      setLoading(false);
      return;
    }

    // Validate course code format (e.g., '305')
    if (!/^\d{3}$/.test(courseCode)) {
      setError('Invalid Course Code format. Expected a 3-digit code (e.g., 101, 215, 303).');
      setLoading(false);
      return;
    }

    const academicYear = parseInt(courseCode.charAt(0), 10);
    const semesterDigit = parseInt(courseCode.charAt(1), 10);
    const academicSemesterNum = semesterDigit === 0 ? 1 : 2; // 0 for 1st sem, 1 for 2nd sem

    // Fetch all existing table names relevant to this academic year and semester
    const allExistingTablesMetadata = await fetchExistingTableNames(academicYear, academicSemesterNum);
    const queryPromises = [];

    // 'Roll no.' will be used for student ID
    const rollNoColumnName = 'Roll no.';

    allExistingTablesMetadata.forEach(meta => {
      // Ensure the course code exists as a column in the table's subject codes
      const subjectCodesForSemester = getSubjectCodesForAcademicSemester(meta.academic_year, meta.academic_semester);
      if (subjectCodesForSemester.includes(courseCode)) {
        // Select only the Roll no. and the specific course code column
        queryPromises.push(
          supabase.from(meta.table_name).select(`"${rollNoColumnName}", "${courseCode}"`)
        );
      }
    });

    let allCourseGrades = [];
    let courseGpaSum = 0;
    let totalPassedStudents = 0;
    let totalFailedStudents = 0;

    try {
      const responses = await Promise.allSettled(queryPromises);

      responses.forEach(response => {
        if (response.status === 'fulfilled' && response.value.data) {
          response.value.data.forEach(record => {
            const studentId = record[rollNoColumnName];
            const gradeLetter = record[courseCode];
            if (studentId && typeof gradeLetter === 'string' && gradeLetter in gradeToGpa) {
              const gradePoint = getGradePoint(gradeLetter);
              allCourseGrades.push({ studentId, gradeLetter, gradePoint });
              courseGpaSum += gradePoint;

              // Determine pass/fail
              if (gradePoint >= getGradePoint('D')) { // Assuming D is the minimum passing grade
                totalPassedStudents++;
              } else {
                totalFailedStudents++;
              }
            }
          });
        } else if (response.status === 'rejected') {
          console.error(`Error fetching data for course ${courseCode}:`, response.reason);
        }
      });

      if (allCourseGrades.length === 0) {
        setError(`No data found for Course Code: ${courseCode}. This might be because the course code is incorrect, or no students have results for it.`);
        setCourseSummary(null);
        return;
      }

      // Calculate Grade Distribution
      const courseGradeCounts = {};
      gradeLabels.forEach(label => courseGradeCounts[label] = 0); // Initialize counts for all labels
      allCourseGrades.forEach(g => {
        if (g.gradeLetter in courseGradeCounts) {
          courseGradeCounts[g.gradeLetter]++;
        }
      });

      const gradeDistributionData = gradeLabels.map(label => courseGradeCounts[label]);

      const avgGpa = allCourseGrades.length > 0 ? (courseGpaSum / allCourseGrades.length) : 0;
      const passRate = allCourseGrades.length > 0 ? (totalPassedStudents / allCourseGrades.length) * 100 : 0;

      // Get overall average GPA from cache or recalculate
      const overallAvg = await calculateOverallAverageGpa();


      setCourseSummary({
        courseCode: courseCode,
        totalStudents: allCourseGrades.length,
        averageGpa: parseFloat(avgGpa.toFixed(3)),
        overallAverageGpa: overallAvg,
        passRate: parseFloat(passRate.toFixed(2)),
        failedStudentsCount: totalFailedStudents,
        gradeDistribution: {
          labels: gradeLabels,
          datasets: [{
            label: 'Number of Students',
            data: gradeDistributionData,
            backgroundColor: [
                'rgba(76, 175, 80, 0.7)', // A+ to B+ (Greens)
                'rgba(76, 175, 80, 0.7)',
                'rgba(76, 175, 80, 0.7)',
                'rgba(139, 195, 74, 0.7)',
                'rgba(139, 195, 74, 0.7)',
                'rgba(139, 195, 74, 0.7)',
                'rgba(255, 193, 7, 0.7)', // C+ to D (Yellows/Oranges)
                'rgba(255, 193, 7, 0.7)',
                'rgba(255, 152, 0, 0.7)',
                'rgba(244, 67, 54, 0.7)'  // F (Red)
            ],
            borderColor: [
                'rgba(76, 175, 80, 1)',
                'rgba(76, 175, 80, 1)',
                'rgba(76, 175, 80, 1)',
                'rgba(139, 195, 74, 1)',
                'rgba(139, 195, 74, 1)',
                'rgba(139, 195, 74, 1)',
                'rgba(255, 193, 7, 1)',
                'rgba(255, 193, 7, 1)',
                'rgba(255, 152, 0, 1)',
                'rgba(244, 67, 54, 1)'
            ],
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
  }, [courseCode, calculateOverallAverageGpa]);

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
            maxLength={3} // Course codes are 3 digits
          />
          <button
            onClick={handleCourseSearch}
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          >
            {loading ? 'Searching...' : 'Search Course'}
          </button>
        </div>
        {error && <p className="text-red-500 mt-4 text-center font-bold">{error}</p>}
      </div>

      {loading && !courseSummary ? (
        <div className="bg-gray-800 p-6 rounded-lg shadow-md text-center text-blue-400">
          <p>Loading course data...</p>
        </div>
      ) : error ? (
        <div className="bg-gray-800 p-6 rounded-lg shadow-md text-center text-red-500">
          <p>{error}</p>
        </div>
      ) : courseSummary ? (
        <div className="bg-gray-800 p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold mb-4 text-center">Summary for Course: {courseSummary.courseCode}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-gray-700 p-4 rounded-md text-center">
              <p className="text-lg font-medium">Total Students:</p>
              <p className="text-4xl font-bold text-blue-400">{courseSummary.totalStudents}</p>
            </div>
            <div className="bg-gray-700 p-4 rounded-md text-center">
              <p className="text-lg font-medium">Average GPA:</p>
              <p className="text-4xl font-bold text-green-400">{courseSummary.averageGpa.toFixed(3)}</p>
            </div>
             <div className="bg-gray-700 p-4 rounded-md text-center">
              <p className="text-lg font-medium">Overall Batch Avg. GPA:</p>
              <p className="text-4xl font-bold text-purple-400">{courseSummary.overallAverageGpa.toFixed(3)}</p>
            </div>
            <div className="bg-gray-700 p-4 rounded-md text-center">
              <p className="text-lg font-medium">Pass Rate:</p>
              <p className="text-4xl font-bold text-teal-400">{courseSummary.passRate}%</p>
            </div>
            <div className="bg-gray-700 p-4 rounded-md text-center">
              <p className="text-lg font-medium">Students with 'F' Grade:</p>
              <p className="text-4xl font-bold text-red-400">{courseSummary.failedStudentsCount}</p>
            </div>
          </div>

          <h3 className="text-xl font-semibold mb-4 text-center mt-8">Course GPA vs. Overall Batch Average</h3>
          {courseSummary.averageGpa !== null && courseSummary.overallAverageGpa !== null && (
            <div className="w-full md:w-3/4 mx-auto mb-8 bg-white p-4 rounded-lg">
              <Bar
                data={{
                  labels: ['This Course Average GPA', 'Overall Batch Average GPA'],
                  datasets: [
                    {
                      label: 'GPA',
                      data: [courseSummary.averageGpa, courseSummary.overallAverageGpa],
                      backgroundColor: ['rgba(0, 123, 255, 0.7)', 'rgba(40, 167, 69, 0.7)'],
                      borderColor: ['rgba(0, 123, 255, 1)', 'rgba(40, 167, 69, 1)'],
                      borderWidth: 1,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: {
                      display: false, // Hide legend as labels are self-explanatory
                    },
                    title: {
                      display: true,
                      text: `Comparison of Course ${courseSummary.courseCode} GPA`,
                      color: 'gray',
                      font: {
                        size: 18,
                      },
                    },
                  },
                  scales: {
                    x: {
                      ticks: {
                        color: 'gray',
                      },
                      grid: {
                        color: 'rgba(0, 0, 0, 0.1)',
                      },
                    },
                    y: {
                      beginAtZero: true,
                      max: 4.0,
                      title: {
                        display: true,
                        text: 'GPA',
                        color: 'gray',
                      },
                      ticks: {
                        color: 'gray',
                      },
                      grid: {
                        color: 'rgba(0, 0, 0, 0.1)',
                      },
                    },
                  },
                }}
              />
            </div>
          )}


          <h3 className="text-xl font-semibold mb-4 text-center mt-8">Grade Distribution</h3>
          {courseSummary.gradeDistribution && (
            <div className="w-full md:w-3/4 mx-auto mb-8 bg-white p-4 rounded-lg">
              <Bar data={courseSummary.gradeDistribution} options={{
                responsive: true,
                plugins: {
                  legend: {
                    position: 'top',
                    labels: {
                      color: 'gray',
                    },
                  },
                  title: {
                    display: true,
                    text: 'Grade Distribution for ' + courseSummary.courseCode,
                    color: 'gray',
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
                      color: 'gray',
                    },
                    ticks: {
                      color: 'gray',
                    },
                    grid: {
                      color: 'rgba(0, 0, 0, 0.1)',
                    },
                  },
                  y: {
                    title: {
                      display: true,
                      text: 'Number of Students',
                      color: 'gray',
                    },
                    ticks: {
                      color: 'gray',
                      precision: 0,
                    },
                    grid: {
                      color: 'rgba(0, 0, 0, 0.1)',
                    },
                  },
                },
              }} />
            </div>
          )}

          {/* Updated section to show Grade Summary table */}
          <h3 className="text-xl font-semibold mb-4 text-center mt-8">Grade Summary for {courseSummary.courseCode}</h3>
          {courseSummary.totalStudents > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-gray-700 rounded-lg text-left text-white">
                <thead>
                  <tr>
                    <th className="py-3 px-4 border-b border-gray-600">Grade</th>
                    <th className="py-3 px-4 border-b border-gray-600">Number of Students</th>
                    <th className="py-3 px-4 border-b border-gray-600">Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {gradeLabels.map((grade) => {
                    // Find the count for the current grade from the gradeDistribution data
                    const count = courseSummary.gradeDistribution.datasets[0].data[gradeLabels.indexOf(grade)];
                    const percentage = courseSummary.totalStudents > 0 ? ((count / courseSummary.totalStudents) * 100).toFixed(2) : 0;
                    return (
                      <tr key={grade} className="hover:bg-gray-600">
                        <td className="py-2 px-4 border-b border-gray-600">{grade}</td>
                        <td className="py-2 px-4 border-b border-gray-600">{count}</td>
                        <td className="py-2 px-4 border-b border-gray-600">{percentage}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-gray-400">No grade summary available for this course.</p>
          )}
        </div>
      ) : (
        !loading && !error && (
          <div className="bg-gray-800 p-6 rounded-lg shadow-md text-center text-gray-300">
            <p>Enter a Course Code and click "Search Course" to view analytics.</p>
          </div>
        )
      )}
    </div>
  );
}
