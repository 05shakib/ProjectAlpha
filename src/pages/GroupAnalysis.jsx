import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient'; // Ensure this path is correct
import ResultTrendChart from '../components/ResultTrendChart';
import {
  COURSE_CREDITS,
  COURSES_PER_SEMESTER,
  fetchExistingTableNames,
  getSubjectCodesForAcademicSemester,
  getGradePoint
} from '../lib/dataUtils';

export default function GroupAnalysis() {
  const [studentIdsInput, setStudentIdsInput] = useState(''); // Input for multiple student IDs
  const [groupStudentData, setGroupStudentData] = useState([]); // Stores processed data for the group
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [groupRanks, setGroupRanks] = useState([]); // Stores ranks for students in the group

  // Helper function to calculate GPA for a set of grades
  const calculateGpa = useCallback((grades) => {
    let totalPoints = 0;
    let totalCredits = 0;
    Object.values(grades).forEach((gradeLetter) => {
      const gradePoint = getGradePoint(gradeLetter);
      const credit = COURSE_CREDITS;
      totalPoints += gradePoint * credit;
      totalCredits += credit;
    });
    return totalCredits > 0 ? parseFloat((totalPoints / totalCredits).toFixed(3)) : 0.000;
  }, []);

  // Helper to calculate CGPA from processed semester data
  const calculateCgpaFromSemesters = useCallback((semesters) => {
    let overallTotalPoints = 0;
    let overallTotalCredits = 0;
    Object.values(semesters).forEach(sem => {
      overallTotalPoints += sem.totalPoints;
      overallTotalCredits += sem.totalCredits;
    });
    return overallTotalCredits > 0 ? parseFloat((overallTotalPoints / overallTotalCredits).toFixed(3)) : 0.000;
  }, []);

  // Main function to fetch and process data for the group of students
  const fetchAndProcessGroupData = useCallback(async () => {
    setError('');
    setLoading(true);
    setGroupStudentData([]);
    setGroupRanks([]);

    const rawStudentIds = studentIdsInput.split(/[\n,]+/).map(id => id.trim()).filter(id => id.length === 10);

    if (rawStudentIds.length === 0) {
      setError('Please enter at least one valid 10-digit Student ID.');
      setLoading(false);
      return;
    }
    if (rawStudentIds.length > 10) {
      setError('Please enter a maximum of 10 Student IDs.');
      setLoading(false);
      return;
    }

    if (!supabase || typeof supabase.from !== 'function') {
      console.error('Supabase client is not properly initialized. Check supabaseClient.js and Vercel environment variables.');
      setError('Application error: Supabase connection failed. Please contact support.');
      setLoading(false);
      return;
    }

    try {
      const allExistingTablesMetadata = await fetchExistingTableNames();
      const allQueryPromises = [];
      const rollNoColumnName = 'Roll no.';

      // Identify latestRegularFirstSemesterTable globally (once) for student names
      let latestRegularFirstSemesterTable = null;
      let latestRegularFirstSemesterExamYear = -1;
      allExistingTablesMetadata.forEach(meta => {
        if (meta.result_type === 'R' && meta.academic_semester === 1) {
          if (meta.exam_year > latestRegularFirstSemesterExamYear) {
            latestRegularFirstSemesterExamYear = meta.exam_year;
            latestRegularFirstSemesterTable = meta.table_name;
          }
        }
      });

      // Prepare all queries for all student IDs across all relevant tables
      rawStudentIds.forEach(studentId => {
        allExistingTablesMetadata.forEach(meta => {
          const subjectCodesForSemester = getSubjectCodesForAcademicSemester(meta.academic_year, meta.academic_semester);
          const filteredSubjectCodes = subjectCodesForSemester.filter(code => typeof code === 'string' && code.length > 0);

          let selectColumns = [`"${rollNoColumnName}"`, ...filteredSubjectCodes.map(code => `"${code}"`)];
          if (meta.table_name === latestRegularFirstSemesterTable) {
            selectColumns.push('Name');
          }
          const formattedSelectString = selectColumns.join(',');

          allQueryPromises.push({
            studentId,
            tableName: meta.table_name,
            academicYear: meta.academic_year,
            academicSemester: meta.academic_semester,
            examYear: meta.exam_year,
            type: meta.result_type,
            rollColName: rollNoColumnName,
            promise: supabase.from(meta.table_name).select(formattedSelectString).eq(`"${rollNoColumnName}"`, studentId)
          });
        });
      });

      const responses = await Promise.allSettled(allQueryPromises.map(q => q.promise));

      const rawStudentRecordsGrouped = new Map(); // Map: studentId -> Map: tableName -> record

      responses.forEach((response, index) => {
        const originalQueryInfo = allQueryPromises[index];
        if (response.status === 'fulfilled' && response.value.data && response.value.data.length > 0) {
          const studentRecord = response.value.data[0];
          const studentId = originalQueryInfo.studentId;

          if (!rawStudentRecordsGrouped.has(studentId)) {
            rawStudentRecordsGrouped.set(studentId, {
              name: `Student ${studentId}`, // Default name
              records: new Map() // Map: tableName -> {meta, data}
            });
          }
          const studentEntry = rawStudentRecordsGrouped.get(studentId);

          if (originalQueryInfo.tableName === latestRegularFirstSemesterTable && studentRecord.Name) {
            studentEntry.name = studentRecord.Name;
          }

          studentEntry.records.set(originalQueryInfo.tableName, {
            meta: originalQueryInfo,
            data: studentRecord
          });
        }
      });

      const processedGroupData = [];
      const studentsForRanking = [];

      // Determine the maximum academic year and semester from metadata to ensure complete data
      let maxAcademicYear = 0;
      let maxAcademicSemester = 0;
      allExistingTablesMetadata.forEach(meta => {
        if (meta.academic_year > maxAcademicYear) {
          maxAcademicYear = meta.academic_year;
          maxAcademicSemester = meta.academic_semester;
        } else if (meta.academic_year === maxAcademicYear && meta.academic_semester > maxAcademicSemester) {
          maxAcademicSemester = meta.academic_semester;
        }
      });

      const requiredSemesterKeys = [];
      for (let y = 1; y <= maxAcademicYear; y++) {
        for (let s = 1; s <= 2; s++) {
          if (y < maxAcademicYear || (y === maxAcademicYear && s <= maxAcademicSemester)) {
            requiredSemesterKeys.push(`${y}-${s}`);
          }
        }
      }
      requiredSemesterKeys.sort((a, b) => {
        const [yearA, semA] = a.split('-').map(Number);
        const [yearB, semB] = b.split('-').map(Number);
        if (yearA !== yearB) return yearA - yearB;
        return semA - b;
      });


      for (const [studentId, studentEntry] of rawStudentRecordsGrouped.entries()) {
        const studentName = studentEntry.name;
        const studentRecords = Array.from(studentEntry.records.values()).map(rec => ({
          tableName: rec.meta.tableName,
          academicYear: rec.meta.academicYear,
          academicSemester: rec.meta.academicSemester,
          examYear: rec.meta.examYear,
          type: rec.meta.type,
          data: rec.data
        }));

        const processedSemestersForThisStudent = {};
        let currentCgpaAccumulator = { totalPoints: 0, totalCredits: 0 };

        // First pass: Process all Regular records to establish original grades
        studentRecords.filter(record => record.type === 'R').forEach(record => {
          const { academicYear, academicSemester, examYear, data } = record;
          const semesterKey = `${academicYear}-${academicSemester}`;
          if (!processedSemestersForThisStudent[semesterKey] || examYear > processedSemestersForThisStudent[semesterKey].examYear) {
            processedSemestersForThisStudent[semesterKey] = {
              examYear: examYear,
              type: 'R',
              grades: {},
              originalGrades: {},
              gpa: data.GPA,
              ygpa: data.YGPA
            };
            const subjectCodes = getSubjectCodesForAcademicSemester(academicYear, academicSemester);
            subjectCodes.forEach(code => {
              if (data[code] !== undefined && data[code] !== null) {
                processedSemestersForThisStudent[semesterKey].grades[code] = data[code];
                processedSemestersForThisStudent[semesterKey].originalGrades[code] = data[code];
              }
            });
          }
        });

        // Second pass: Process Improvement records
        studentRecords.filter(record => record.type === 'I').forEach(record => {
          const { academicYear, academicSemester, data } = record;
          const semesterKey = `${academicYear}-${academicSemester}`;
          const improvementRecord = data;
          const subjectCodes = getSubjectCodesForAcademicSemester(academicYear, academicSemester);

          if (!processedSemestersForThisStudent[semesterKey]) {
            processedSemestersForThisStudent[semesterKey] = {
              examYear: -1,
              type: 'I',
              grades: {},
              originalGrades: {},
              gpa: improvementRecord.GPA || 0.00,
              ygpa: improvementRecord.YGPA || 0.00
            };
          }

          subjectCodes.forEach(code => {
            const improvedGrade = improvementRecord[code];
            const isValidImprovedGrade = typeof improvedGrade === 'string' && getGradePoint(improvedGrade) !== undefined;
            if (isValidImprovedGrade) {
              const originalGrade = processedSemestersForThisStudent[semesterKey]?.originalGrades[code];
              const currentAppliedGrade = processedSemestersForThisStudent[semesterKey]?.grades[code];
              const originalGradePoint = getGradePoint(originalGrade);
              const currentAppliedGradePoint = getGradePoint(currentAppliedGrade);
              const improvedGradePoint = getGradePoint(improvedGrade);
              const isEligibleForImprovement = originalGradePoint < getGradePoint('B-') || originalGrade === 'F';

              if (isEligibleForImprovement && improvedGradePoint > currentAppliedGradePoint) {
                processedSemestersForThisStudent[semesterKey].grades[code] = improvedGrade;
              } else if (currentAppliedGrade === undefined) {
                processedSemestersForThisStudent[semesterKey].grades[code] = improvedGrade;
                if (processedSemestersForThisStudent[semesterKey].originalGrades[code] === undefined) {
                  processedSemestersForThisStudent[semesterKey].originalGrades[code] = improvedGrade;
                }
              }
            }
          });
        });

        const chronologicalSemesterKeysForStudent = Object.keys(processedSemestersForThisStudent).sort((a, b) => {
          const [yearA, semA] = a.split('-').map(Number);
          const [yearB, semB] = b.split('-').map(Number);
          if (yearA !== yearB) return yearA - yearB;
          return semA - b;
        });

        let studentTotalFGrades = 0;
        let studentTotalImprovementsApplied = 0;
        let studentSumOfAllGradePoints = 0;
        const gpasForStdDev = [];

        for (const semesterKey of chronologicalSemesterKeysForStudent) {
          const gradesMap = processedSemestersForThisStudent[semesterKey].grades;
          const originalGradesMap = processedSemestersForThisStudent[semesterKey].originalGrades;
          let semesterTotalPoints = 0;
          let semesterTotalCredits = 0;

          Object.entries(gradesMap).forEach(([code, gradeLetter]) => {
            const gradePoint = getGradePoint(gradeLetter);
            const credit = COURSE_CREDITS;
            semesterTotalPoints += gradePoint * credit;
            semesterTotalCredits += credit;

            if (gradeLetter === 'F') {
              studentTotalFGrades++;
            }
            if (originalGradesMap[code] !== undefined && gradeLetter !== originalGradesMap[code]) {
              studentTotalImprovementsApplied++;
            }
            studentSumOfAllGradePoints += gradePoint;
          });

          const semesterGpa = semesterTotalCredits > 0 ? parseFloat((semesterTotalPoints / semesterTotalCredits).toFixed(3)) : 0.000;
          gpasForStdDev.push(semesterGpa);

          processedSemestersForThisStudent[semesterKey].totalPoints = semesterTotalPoints;
          processedSemestersForThisStudent[semesterKey].totalCredits = semesterTotalCredits;
          processedSemestersForThisStudent[semesterKey].gpa = semesterGpa;

          currentCgpaAccumulator.totalPoints += semesterTotalPoints;
          currentCgpaAccumulator.totalCredits += semesterTotalCredits;
          processedSemestersForThisStudent[semesterKey].cgpa = currentCgpaAccumulator.totalCredits > 0 ? parseFloat((currentCgpaAccumulator.totalPoints / currentCgpaAccumulator.totalCredits).toFixed(3)) : 0.000;
        }

        let gpaStandardDeviation = 0;
        if (gpasForStdDev.length > 1) {
          const meanGpa = gpasForStdDev.reduce((sum, gpa) => sum + gpa, 0) / gpasForStdDev.length;
          const sumOfSquaredDifferences = gpasForStdDev.reduce((sum, gpa) => sum + Math.pow(gpa - meanGpa, 2), 0);
          gpaStandardDeviation = parseFloat(Math.sqrt(sumOfSquaredDifferences / (gpasForStdDev.length - 1)).toFixed(3));
        } else if (gpasForStdDev.length === 1) {
          gpaStandardDeviation = 0.000;
        }

        const studentOverallCgpa = currentCgpaAccumulator.totalCredits > 0 ? parseFloat((currentCgpaAccumulator.totalPoints / currentCgpaAccumulator.totalCredits).toFixed(3)) : 0.000;

        // Check if student has records for all required semesters
        const studentSemesterKeys = new Set(Object.keys(processedSemestersForThisStudent));
        const hasAllRequiredSemesters = requiredSemesterKeys.every(key => studentSemesterKeys.has(key));

        processedGroupData.push({
          id: studentId,
          name: studentName,
          overallCgpa: studentOverallCgpa,
          semesters: processedSemestersForThisStudent,
          gpaHistory: requiredSemesterKeys.map(key => processedSemestersForThisStudent[key]?.gpa || 0),
          cgpaHistory: requiredSemesterKeys.map(key => processedSemestersForThisStudent[key]?.cgpa || 0),
          totalFGrades: studentTotalFGrades,
          totalImprovementsApplied: studentTotalImprovementsApplied,
          sumOfAllGradePoints: studentSumOfAllGradePoints,
          gpaStandardDeviation: gpaStandardDeviation,
          isComplete: hasAllRequiredSemesters, // Add completion status
        });

        if (hasAllRequiredSemesters) { // Only include complete students for ranking
            studentsForRanking.push({
                studentId: studentId,
                name: studentName,
                cgpa: studentOverallCgpa,
                totalFGrades: studentTotalFGrades,
                totalImprovementsApplied: studentTotalImprovementsApplied,
                sumOfAllGradePoints: studentSumOfAllGradePoints,
                gpaStandardDeviation: gpaStandardDeviation,
            });
        }
      }

      // Sort students for ranking
      studentsForRanking.sort((a, b) => {
        if (b.cgpa !== a.cgpa) return b.cgpa - a.cgpa;
        if (a.totalFGrades !== b.totalFGrades) return a.totalFGrades - b.totalFGrades;
        if (a.totalImprovementsApplied !== b.totalImprovementsApplied) return a.totalImprovementsApplied - b.totalImprovementsApplied;
        if (a.gpaStandardDeviation !== b.gpaStandardDeviation) return a.gpaStandardDeviation - b.gpaStandardDeviation;
        if (b.sumOfAllGradePoints !== a.sumOfAllGradePoints) return b.sumOfAllGradePoints - a.sumOfAllGradePoints;
        return a.studentId.localeCompare(b.studentId);
      });

      // Assign ranks to the students in the group
      const groupRankings = [];
      let currentRank = 1;
      let prevCgpa = -1;
      let prevFGrades = -1;
      let prevImprovements = -1;
      let prevStdDev = -1;
      let prevSumGradePoints = -1;

      for (let i = 0; i < studentsForRanking.length; i++) {
        const s = studentsForRanking[i];
        if (s.cgpa < prevCgpa ||
            (s.cgpa === prevCgpa && s.totalFGrades > prevFGrades) ||
            (s.cgpa === prevCgpa && s.totalFGrades === prevFGrades && s.totalImprovementsApplied > prevImprovements) ||
            (s.cgpa === prevCgpa && s.totalFGrades === prevFGrades && s.totalImprovementsApplied === prevImprovements && s.gpaStandardDeviation > prevStdDev) ||
            (s.cgpa === prevCgpa && s.totalFGrades === prevFGrades && s.totalImprovementsApplied === prevImprovements && s.gpaStandardDeviation === prevStdDev && s.sumOfAllGradePoints < prevSumGradePoints)
        ) {
          currentRank = i + 1;
        }
        groupRankings.push({
          studentId: s.studentId,
          name: s.name,
          cgpa: s.cgpa.toFixed(3),
          rank: currentRank
        });
        prevCgpa = s.cgpa;
        prevFGrades = s.totalFGrades;
        prevImprovements = s.totalImprovementsApplied;
        prevStdDev = s.gpaStandardDeviation;
        prevSumGradePoints = s.sumOfAllGradePoints;
      }
      setGroupRanks(groupRankings);

      setGroupStudentData(processedGroupData);

    } catch (err) {
      console.error("Error fetching or processing group data:", err);
      setError('Failed to load group data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [studentIdsInput, calculateGpa, calculateCgpaFromSemesters]);

  // Effect to trigger data fetching when studentIdsInput changes
  useEffect(() => {
    // Only fetch if there's actual input to process
    if (studentIdsInput.trim().length > 0) {
      fetchAndProcessGroupData();
    } else {
      setGroupStudentData([]);
      setGroupRanks([]);
      setError('');
      setLoading(false);
    }
  }, [studentIdsInput, fetchAndProcessGroupData]);

  // Prepare chart data based on groupStudentData
  const getChartData = useCallback((type) => { // 'gpa' or 'cgpa'
    if (groupStudentData.length === 0) return null;

    const allSemesterLabels = [];
    // Collect all unique semester keys from all students and sort them
    const uniqueSemesterKeys = new Set();
    groupStudentData.forEach(student => {
      Object.keys(student.semesters).forEach(key => uniqueSemesterKeys.add(key));
    });
    const sortedSemesterKeys = Array.from(uniqueSemesterKeys).sort((a, b) => {
      const [yearA, semA] = a.split('-').map(Number);
      const [yearB, semB] = b.split('-').map(Number);
      if (yearA !== yearB) return yearA - yearB;
      return semA - b;
    });

    sortedSemesterKeys.forEach(key => {
      const [year, sem] = key.split('-').map(Number);
      allSemesterLabels.push(`${year} Year ${sem === 1 ? '1st' : '2nd'} Semester`);
    });

    const datasets = groupStudentData.map((student, index) => {
      const dataPoints = sortedSemesterKeys.map(key => {
        const semesterData = student.semesters[key];
        return semesterData ? (type === 'gpa' ? semesterData.gpa : semesterData.cgpa) : null;
      });

      // Simple color palette for up to 10 students
      const colors = [
        'rgba(0, 123, 255, 1)',  // Blue
        'rgba(40, 167, 69, 1)',  // Green
        'rgba(255, 193, 7, 1)',  // Yellow
        'rgba(220, 53, 69, 1)',  // Red
        'rgba(108, 117, 125, 1)',// Gray
        'rgba(23, 162, 184, 1)', // Cyan
        'rgba(111, 66, 193, 1)', // Indigo
        'rgba(253, 126, 20, 1)', // Orange
        'rgba(102, 16, 242, 1)', // Purple
        'rgba(32, 201, 151, 1)'  // Teal
      ];

      // Get last name for label, fallback to ID
      const nameParts = student.name.split(' ');
      const label = nameParts.length > 1 ? nameParts[nameParts.length - 1] : student.id;

      return {
        label: label,
        data: dataPoints,
        borderColor: colors[index % colors.length],
        backgroundColor: colors[index % colors.length].replace('1)', '0.2)'), // Lighter fill
        fill: false, // No fill for individual student lines
        tension: 0.3,
      };
    });

    return {
      labels: allSemesterLabels,
      datasets: datasets,
    };
  }, [groupStudentData]);


  const gpaChartData = getChartData('gpa');
  const cgpaChartData = getChartData('cgpa');

  return (
    <section className="container mx-auto p-4 pt-16 text-white">
      <h1 className="text-3xl font-bold mb-6 text-center">Group Student Analysis</h1>

      <div className="bg-gray-800 p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-2xl font-semibold mb-4">Enter Student IDs</h2>
        <textarea
          placeholder="Enter up to 10 Student IDs, separated by commas or new lines (e.g., 2112135101, 2112135102)"
          className="p-3 border border-gray-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-full h-32 mb-4"
          value={studentIdsInput}
          onChange={(e) => setStudentIdsInput(e.target.value)}
        />
        <button
          onClick={fetchAndProcessGroupData}
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
          disabled={loading}
        >
          {loading ? 'Analyzing...' : 'Analyze Group Data'}
        </button>
        {error && <p className="text-red-500 mt-4 text-center font-bold">{error}</p>}
      </div>

      {loading && groupStudentData.length === 0 ? (
        <div className="bg-gray-800 p-6 rounded-lg shadow-md text-center text-blue-400">
          <p>Loading group data...</p>
        </div>
      ) : error ? (
        <div className="bg-gray-800 p-6 rounded-lg shadow-md text-center text-red-500">
          <p>{error}</p>
        </div>
      ) : groupStudentData.length > 0 ? (
        <div className="bg-gray-800 p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold mb-4 text-center">Results for the Group of Students</h2>

          {/* Table for Group Students with ID, Name, Overall CGPA, Overall Rank */}
          <h3 className="text-xl font-semibold mb-4 text-center mt-8">Group Performance Summary</h3>
          <div className="overflow-x-auto mb-8">
            <table className="min-w-full bg-gray-700 rounded-lg text-left text-white">
              <thead>
                <tr>
                  <th className="py-3 px-4 border-b border-gray-600">Rank</th>
                  <th className="py-3 px-4 border-b border-gray-600">Student ID</th>
                  <th className="py-3 px-4 border-b border-gray-600">Name</th>
                  <th className="py-3 px-4 border-b border-gray-600">Overall CGPA</th>
                </tr>
              </thead>
              <tbody>
                {groupRanks.map((student) => (
                  <tr key={student.studentId} className="hover:bg-gray-600">
                    <td className="py-2 px-4 border-b border-gray-600">{student.rank}</td>
                    <td className="py-2 px-4 border-b border-gray-600">{student.studentId}</td>
                    <td className="py-2 px-4 border-b border-gray-600">{student.name}</td>
                    <td className="py-2 px-4 border-b border-gray-600">{student.cgpa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* GPA Trend Chart for the Group */}
          {gpaChartData && (
            <div className="mt-8 p-4 rounded-lg max-w-4xl mx-auto bg-white">
              <h3 className="text-xl font-semibold mb-4 text-center text-gray-800">GPA Trend for Group Students</h3>
              <ResultTrendChart
                labels={gpaChartData.labels}
                datasets={gpaChartData.datasets}
                title="GPA Trend"
                yAxisLabel="GPA"
              />
            </div>
          )}

          {/* CGPA Trend Chart for the Group */}
          {cgpaChartData && (
            <div className="mt-8 p-4 rounded-lg max-w-4xl mx-auto bg-white">
              <h3 className="text-xl font-semibold mb-4 text-center text-gray-800">CGPA Trend for Group Students</h3>
              <ResultTrendChart
                labels={cgpaChartData.labels}
                datasets={cgpaChartData.datasets}
                title="CGPA Trend"
                yAxisLabel="CGPA"
              />
            </div>
          )}
        </div>
      ) : (
        !loading && !error && (
          <div className="bg-gray-800 p-6 rounded-lg shadow-md text-center text-gray-300">
            <p>Enter Student IDs above to view group results.</p>
          </div>
        )
      )}
    </section>
  );
}
