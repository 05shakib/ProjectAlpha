import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient'; // Ensure this is correctly imported
import ResultTrendChart from '../components/ResultTrendChart'; // Import the Chart component

export default function ResultAnalysis() {
  const [activeTab, setActiveTab] = useState('student');
  const [studentId, setStudentId] = useState('2112135101'); // Default student ID
  const [courseCode, setCourseCode] = useState('');
  const [studentData, setStudentData] = useState(null);
  const [overallStudentRank, setOverallStudentRank] = useState(null); // New state for overall rank
  const [courseSummary, setCourseSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedSemester, setExpandedSemester] = useState(null); // New state for expanded semester details

  // New gradeToGpa mapping provided by the user
  const gradeToGpa = {
    'A+': 4.00, 'A': 3.75, 'A-': 3.50, 'B+': 3.25, 'B': 3.00,
    'B-': 2.75, 'C+': 2.50, 'C': 2.25, 'D': 2.00, 'F': 0.00
  };
  const COURSE_CREDITS = 3;
  const COURSES_PER_SEMESTER = 5; // User specified 5 courses per semester

  // Helper to get grade point from letter
  const getGradePoint = (gradeLetter) => gradeToGpa[gradeLetter] || 0.00;

  // Function to infer semester string from table name or calculated data
  const inferSemesterFromTableName = (tableName) => {
    // Expected table format: YS_SY_Type (e.g., 1121R, 1221I)
    // where Y is year (1-4), S is semester (1-2), SY is exam year suffix (e.g., 21 for 2021), Type is R/I
    const academicYear = parseInt(tableName.substring(0, 1)); // e.g., '1' for 1st year
    const academicSemesterNum = parseInt(tableName.substring(1, 2)); // e.g., '1' for 1st semester
    const examYearSuffix = tableName.substring(2, 4); // e.g., '21' for 2021
    const type = tableName.substring(4, 5); // 'R' for Regular, 'I' for Improvement

    let semesterString = '';
    if (academicYear === 1) semesterString += '1st Year ';
    else if (academicYear === 2) semesterString += '2nd Year ';
    else if (academicYear === 3) semesterString += '3rd Year ';
    else if (academicYear === 4) semesterString += '4th Year ';

    if (academicSemesterNum === 1) semesterString += '1st Semester ';
    else if (academicSemesterNum === 2) semesterString += '2nd Semester ';

    semesterString += `20${examYearSuffix}`;
    if (type === 'I') semesterString += ' (Improvement)';
    return semesterString;
  };

  const calculateSemesterGPA = (grades) => {
    if (grades.length === 0) return 0;
    const totalGradePoints = grades.reduce((sum, g) => sum + getGradePoint(g.gradeLetter), 0);
    return totalGradePoints / grades.length;
  };

  const handleStudentSearch = async () => {
    setError('');
    setLoading(true);
    setStudentData(null); // Clear previous data
    setOverallStudentRank(null);
    setExpandedSemester(null); // Reset expanded semester

    if (!studentId.trim()) {
      setError('Please enter a Student ID.');
      setLoading(false);
      return;
    }

    const queryPromises = [];
    // Dynamically generate table names for exam years 2016-2030 (represented as '16' to '30')
    const semesterPrefixes = ['11', '12', '21', '22', '31', '32', '41', '42']; // Up to 4th year, 2nd semester
    const resultTypes = ['R', 'I']; // Regular and Improvement exams

    for (let yearSuffix = 16; yearSuffix <= 30; yearSuffix++) {
      const yearStr = String(yearSuffix).padStart(2, '0');
      for (const prefix of semesterPrefixes) {
        for (const type of resultTypes) {
          const tableName = `${prefix}${yearStr}${type}`;
          queryPromises.push({
            tableName: tableName,
            promise: supabase.from(tableName).select('*') // Select all to get other students for averages/ranks
          });
        }
      }
    }

    const rawStudentGradeEntries = [];
    const allSemesterData = new Map(); // Key: tableName, Value: array of all student records for that table

    try {
      const responses = await Promise.all(queryPromises.map(qp => qp.promise));
      
      responses.forEach((response, index) => {
        const tableName = queryPromises[index].tableName;
        const academicYear = parseInt(tableName.substring(0, 1));
        const academicSemesterNum = parseInt(tableName.substring(1, 2));
        const examYearSuffix = parseInt(tableName.substring(2, 4));
        const type = tableName.substring(4, 5);

        if (response.data && response.data.length > 0) {
          allSemesterData.set(tableName, response.data); // Store all data for this table

          const studentRecord = response.data.find(rec => String(rec['Roll no.']) === studentId);

          if (studentRecord) {
            for (let i = 1; i <= COURSES_PER_SEMESTER; i++) {
              const courseSemesterDigit = academicSemesterNum === 1 ? 0 : 1;
              const courseCode = `${academicYear}${courseSemesterDigit}${i}`;
              const gradeLetter = studentRecord[courseCode];

              if (gradeLetter && gradeLetter in gradeToGpa) {
                rawStudentGradeEntries.push({
                  courseCode,
                  gradeLetter,
                  academicYear,
                  academicSemesterNum,
                  examYear: examYearSuffix,
                  type,
                  semesterTableName: tableName
                });
              }
            }
          }
        }
      });

      // --- Apply Re-add Logic (Filter out superseded Regular results) ---
      const filteredGradeEntries = [];
      const academicSemesterExamYears = new Map(); // Key: `${academicYear}_${academicSemesterNum}`, Value: latest 'R' examYear

      rawStudentGradeEntries.forEach(entry => {
        if (entry.type === 'R') {
          const key = `${entry.academicYear}_${entry.academicSemesterNum}`;
          if (!academicSemesterExamYears.has(key) || entry.examYear > academicSemesterExamYears.get(key)) {
            academicSemesterExamYears.set(key, entry.examYear);
          }
        }
      });

      rawStudentGradeEntries.forEach(entry => {
        if (entry.type === 'R') {
          const key = `${entry.academicYear}_${entry.academicSemesterNum}`;
          if (entry.examYear === academicSemesterExamYears.get(key)) {
            filteredGradeEntries.push(entry);
          }
        } else {
          filteredGradeEntries.push(entry);
        }
      });

      // --- Determine Final Best Grades for each course ---
      const studentCourseGrades = new Map();

      filteredGradeEntries.sort((a, b) => {
        if (a.examYear !== b.examYear) return b.examYear - a.examYear;
        if (a.type === 'I' && b.type === 'R') return -1;
        if (a.type === 'R' && b.type === 'I') return 1;
        return getGradePoint(b.gradeLetter) - getGradePoint(a.gradeLetter);
      });

      for (const entry of filteredGradeEntries) {
        const { courseCode, gradeLetter, academicYear, academicSemesterNum, examYear, type } = entry;
        const existingGradeInfo = studentCourseGrades.get(courseCode);

        if (!existingGradeInfo) {
          studentCourseGrades.set(courseCode, { gradeLetter, academicYear, academicSemesterNum, examYear, type });
        } else {
          const newGradePoint = getGradePoint(gradeLetter);
          const existingGradePoint = getGradePoint(existingGradeInfo.gradeLetter);

          const isNewBetter =
            (type === 'I' && existingGradeInfo.type === 'R') ||
            (examYear > existingGradeInfo.examYear) ||
            (examYear === existingGradeInfo.examYear && newGradePoint > existingGradePoint);

          if (isNewBetter) {
            studentCourseGrades.set(courseCode, { gradeLetter, academicYear, academicSemesterNum, examYear, type });
          }
        }
      }

      // Group final course grades by academic semester for GPA calculation
      const semesterFinalGrades = new Map(); // Stores { totalGradePoints, totalCourses, courseDetails: [] } for each semester

      for (const [courseCode, courseInfo] of studentCourseGrades.entries()) {
        const { gradeLetter, academicYear, academicSemesterNum, examYear } = courseInfo;
        const semesterKey = `${academicYear}_${academicSemesterNum}_${examYear}`;

        if (!semesterFinalGrades.has(semesterKey)) {
          semesterFinalGrades.set(semesterKey, { totalGradePoints: 0, totalCourses: 0, courseDetails: [] });
        }
        const semData = semesterFinalGrades.get(semesterKey);
        semData.totalGradePoints += getGradePoint(gradeLetter);
        semData.totalCourses += 1;
        semData.courseDetails.push({ courseCode, gradeLetter, gradePoint: getGradePoint(gradeLetter) });
      }

      const calculatedStudentResults = [];
      let cumulativeGradePoints = 0;
      let cumulativeCourses = 0;

      const sortedSemesterKeys = Array.from(semesterFinalGrades.keys()).sort((a, b) => {
        const [aAcademicYear, aAcademicSemNum, aExamYear] = a.split('_').map(Number);
        const [bAcademicYear, bAcademicSemNum, bExamYear] = b.split('_').map(Number);

        if (aExamYear !== bExamYear) return aExamYear - bExamYear;
        if (aAcademicYear !== bAcademicYear) return aAcademicYear - bAcademicYear;
        return aAcademicSemNum - bAcademicSemNum;
      });

      const academicYearData = new Map(); // Key: academicYear, Value: { totalGradePoints, totalCourses }

      for (const semesterKey of sortedSemesterKeys) {
        const [academicYear, academicSemesterNum, examYear] = semesterKey.split('_').map(Number);
        const semData = semesterFinalGrades.get(semesterKey);

        const GPA = semData.totalCourses > 0 ? (semData.totalGradePoints / semData.totalCourses) : 0;

        cumulativeGradePoints += semData.totalGradePoints;
        cumulativeCourses += semData.totalCourses;
        const CGPA = cumulativeCourses > 0 ? (cumulativeGradePoints / cumulativeCourses) : 0;

        if (!academicYearData.has(academicYear)) {
          academicYearData.set(academicYear, { totalGradePoints: 0, totalCourses: 0 });
        }
        const yearData = academicYearData.get(academicYear);
        yearData.totalGradePoints += semData.totalGradePoints;
        yearData.totalCourses += semData.totalCourses;

        const semesterString = inferSemesterFromTableName(`${academicYear}${academicSemesterNum}${String(examYear).padStart(2, '0')}R`); // Use 'R' for display string

        // Calculate Semester Average GPA and Student Rank
        let semesterAverageGPA = 0;
        let studentRank = 0;
        let totalStudentsInSemester = 0;

        const currentSemesterTableName = `${academicYear}${academicSemesterNum}${String(examYear).padStart(2, '0')}${semData.type || 'R'}`; // Use actual type if known, else default to R
        const allStudentsInCurrentSemester = allSemesterData.get(currentSemesterTableName);

        if (allStudentsInCurrentSemester && allStudentsInCurrentSemester.length > 0) {
            const allSemesterGPAs = [];
            allStudentsInCurrentSemester.forEach(studentRec => {
                let studentSemTotalPoints = 0;
                let studentSemTotalCourses = 0;
                for (let i = 1; i <= COURSES_PER_SEMESTER; i++) {
                    const courseSemesterDigit = academicSemesterNum === 1 ? 0 : 1;
                    const courseCode = `${academicYear}${courseSemesterDigit}${i}`;
                    const grade = studentRec[courseCode];
                    if (grade && grade in gradeToGpa) {
                        studentSemTotalPoints += getGradePoint(grade);
                        studentSemTotalCourses += 1;
                    }
                }
                if (studentSemTotalCourses > 0) {
                    allSemesterGPAs.push({
                        id: String(studentRec['Roll no.']),
                        gpa: (studentSemTotalPoints / studentSemTotalCourses)
                    });
                }
            });

            if (allSemesterGPAs.length > 0) {
                const totalGPA = allSemesterGPAs.reduce((sum, s) => sum + s.gpa, 0);
                semesterAverageGPA = totalGPA / allSemesterGPAs.length;
                totalStudentsInSemester = allSemesterGPAs.length;

                // Calculate rank
                const sortedGPAs = allSemesterGPAs.sort((a, b) => b.gpa - a.gpa); // Sort descending
                const studentIndex = sortedGPAs.findIndex(s => s.id === studentId);
                if (studentIndex !== -1) {
                    studentRank = studentIndex + 1;
                }
            }
        }

        calculatedStudentResults.push({
          Semester: semesterString,
          GPA: GPA,
          CGPA: CGPA,
          YGPA: null,
          CourseDetails: semData.courseDetails, // Add course details
          SemesterAverageGPA: semesterAverageGPA,
          StudentRank: studentRank,
          TotalStudentsInSemester: totalStudentsInSemester
        });
      }

      const finalStudentResults = [];
      let cumulativeYGPAPoints = 0;
      let cumulativeYGPAYears = 0;

      for (let i = 0; i < calculatedStudentResults.length; i++) {
        const result = calculatedStudentResults[i];
        const semesterParts = result.Semester.match(/(\d)(?:st|nd|rd|th) Year (\d)(?:st|nd) Semester/);
        const academicYear = semesterParts ? parseInt(semesterParts[1]) : 0;
        const academicSemesterNum = semesterParts ? parseInt(semesterParts[2]) : 0;
        
        let YGPA = null;
        let yearlyAverageGPA = null;
        let studentYearRank = 0;
        let totalStudentsInYear = 0;

        if (academicSemesterNum === 2) { // YGPA is typically calculated after both semesters of an academic year
          const yearData = academicYearData.get(academicYear);
          if (yearData && yearData.totalCourses > 0) {
            YGPA = (yearData.totalGradePoints / yearData.totalCourses);
          }

          // Calculate Yearly Average GPA and Student Rank for the year
          const allYearGPAs = [];
          const relevantSemesterTablesForYear = [];
          // Collect all R and I tables for the current academic year across all exam years
          for (let y = 16; y <= 30; y++) {
              const yearStr = String(y).padStart(2, '0');
              relevantSemesterTablesForYear.push(`${academicYear}1${yearStr}R`, `${academicYear}2${yearStr}R`);
              relevantSemesterTablesForYear.push(`${academicYear}1${yearStr}I`, `${academicYear}2${yearStr}I`);
          }

          const yearStudentGrades = new Map(); // Key: studentId, Value: { totalPoints, totalCourses }

          for (const tableName of relevantSemesterTablesForYear) {
              const studentsInTable = allSemesterData.get(tableName);
              if (studentsInTable) {
                  const currentAcademicYear = parseInt(tableName.substring(0, 1));
                  const currentAcademicSemesterNum = parseInt(tableName.substring(1, 2));
                  const currentExamYear = parseInt(tableName.substring(2, 4));
                  const currentType = tableName.substring(4, 5);

                  studentsInTable.forEach(studentRec => {
                      const currentStudentId = String(studentRec['Roll no.']);
                      if (!yearStudentGrades.has(currentStudentId)) {
                          yearStudentGrades.set(currentStudentId, { grades: new Map() });
                      }
                      const studentYearData = yearStudentGrades.get(currentStudentId);

                      for (let k = 1; k <= COURSES_PER_SEMESTER; k++) {
                          const courseSemesterDigit = currentAcademicSemesterNum === 1 ? 0 : 1;
                          const courseCode = `${currentAcademicYear}${courseSemesterDigit}${k}`;
                          const gradeLetter = studentRec[courseCode];

                          if (gradeLetter && gradeLetter in gradeToGpa) {
                              const existingCourseGrade = studentYearData.grades.get(courseCode);
                              const newGradePoint = getGradePoint(gradeLetter);

                              if (!existingCourseGrade) {
                                  studentYearData.grades.set(courseCode, { gradeLetter, examYear: currentExamYear, type: currentType });
                              } else {
                                  const existingGradePoint = getGradePoint(existingCourseGrade.gradeLetter);
                                  const isNewGradeFromImprovement = (currentType === 'I');
                                  const isExistingGradeFromImprovement = (existingCourseGrade.type === 'I');

                                  if (isNewGradeFromImprovement && !isExistingGradeFromImprovement) {
                                      studentYearData.grades.set(courseCode, { gradeLetter, examYear: currentExamYear, type: currentType });
                                  } else if (!isNewGradeFromImprovement && isExistingGradeFromImprovement) {
                                      // Existing is Improvement, New is Regular - Existing wins
                                  } else { // Both Regular or Both Improvement
                                      if (currentExamYear > existingCourseGrade.examYear) {
                                          studentYearData.grades.set(courseCode, { gradeLetter, examYear: currentExamYear, type: currentType });
                                      } else if (currentExamYear === existingCourseGrade.examYear) {
                                          if (newGradePoint > existingGradePoint) {
                                              studentYearData.grades.set(courseCode, { gradeLetter, examYear: currentExamYear, type: currentType });
                                          }
                                      }
                                  }
                              }
                          }
                      }
                  });
              }
          }

          // Calculate YGPA for all students in this academic year
          yearStudentGrades.forEach((data, sId) => {
              let totalPoints = 0;
              let totalCourses = 0;
              data.grades.forEach(gradeInfo => {
                  totalPoints += getGradePoint(gradeInfo.gradeLetter);
                  totalCourses += 1;
              });
              if (totalCourses > 0) {
                  allYearGPAs.push({ id: sId, ygpa: (totalPoints / totalCourses) });
              }
          });

          if (allYearGPAs.length > 0) {
              const totalYGPA = allYearGPAs.reduce((sum, s) => sum + s.ygpa, 0);
              yearlyAverageGPA = totalYGPA / allYearGPAs.length;
              totalStudentsInYear = allYearGPAs.length;

              const sortedYGPAs = allYearGPAs.sort((a, b) => b.ygpa - a.ygpa);
              const studentIndex = sortedYGPAs.findIndex(s => s.id === studentId);
              if (studentIndex !== -1) {
                  studentYearRank = studentIndex + 1;
              }
          }
        }

        finalStudentResults.push({
            ...result,
            YGPA,
            YearlyAverageGPA: yearlyAverageGPA,
            StudentYearRank: studentYearRank,
            TotalStudentsInYear: totalStudentsInYear
        });
      }


      if (finalStudentResults.length > 0) {
        setStudentData(finalStudentResults);
        setError('');

        // Calculate overall CGPA and rank for the student
        const finalCGPA = finalStudentResults[finalStudentResults.length - 1]?.CGPA || 0;
        let overallRank = 0;
        let overallTotalStudents = 0;
        let overallAverageCGPA = 0;

        // This part would require fetching ALL students' final CGPA
        // For simplicity and performance, we'll calculate a very rough "batch average"
        // based on the average of the *last available semester's average GPA* for the student's final year.
        // A true overall batch average would require a dedicated Supabase view/function or massive client-side fetch.
        if (finalStudentResults.length > 0) {
            const lastResult = finalStudentResults[finalStudentResults.length - 1];
            const lastSemesterAverage = lastResult.SemesterAverageGPA;
            const lastSemesterTotalStudents = lastResult.TotalStudentsInSemester;

            if (lastSemesterAverage > 0 && lastSemesterTotalStudents > 0) {
                overallAverageCGPA = lastSemesterAverage; // Using last semester avg as proxy for batch avg
                overallTotalStudents = lastSemesterTotalStudents;
                overallRank = lastResult.StudentRank; // Using last semester rank as proxy
            }
        }

        setOverallStudentRank({
            cgpa: finalCGPA,
            rank: overallRank,
            totalStudents: overallTotalStudents,
            averageCGPA: overallAverageCGPA
        });

      } else {
        setError(`No data found for Student ID: ${studentId} across the checked tables. This might be because the tables for this student's results do not yet exist or the ID is incorrect.`);
      }
    } catch (err) {
      console.error("General error fetching student data:", err);
      setError("Failed to fetch student data due to an unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCourseSearch = async () => {
    setError('');
    setLoading(true);
    setCourseSummary(null);

    if (!courseCode.trim()) {
      setError('Please enter a Course Code.');
      setLoading(false);
      return;
    }

    // This part assumes 'CourseResults' is a single table for all course data.
    // If course data is also split by year/semester tables (e.g., you want to find all students who took '115'
    // by searching across all 11xx tables), this logic would need adjustment.
    try {
      const { data, error: fetchError } = await supabase
        .from('CourseResults')
        .select('*')
        .eq('course_code', courseCode);

      if (fetchError) {
        console.error("Error fetching course data:", fetchError);
        setError("Failed to fetch course data. " + fetchError.message);
        setCourseSummary(null);
      } else if (data && data.length > 0) {
        const summary = {
          code: courseCode,
          totalStudents: data.length,
          results: data,
        };
        setCourseSummary(summary);
        setError('');
      } else {
        setError(`No data found for Course Code: ${courseCode}. Please check the code and data in Supabase, or if this course data resides in student result tables, a different search method is required.`);
      }
    } catch (err) {
      console.error("An unexpected error occurred during course data fetching:", err);
      setError("An unexpected error occurred during course data fetching. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Auto-search for the default student ID on initial load if no data/error
    if (studentId === '2112135101' && !studentData && !error) {
      handleStudentSearch();
    }
  }, [studentId, studentData, error]);


  const studentGpaData = studentData ? {
    labels: studentData.map(d => d.Semester),
    datasets: [{
      label: 'GPA',
      data: studentData.map(d => d.GPA.toFixed(2)),
      borderColor: 'rgb(75, 192, 192)',
      tension: 0.1,
      fill: false,
    }, {
      label: 'CGPA',
      data: studentData.map(d => d.CGPA.toFixed(2)),
      borderColor: 'rgb(153, 102, 255)',
      tension: 0.1,
      fill: false,
    },
    {
        label: 'YGPA',
        data: studentData.map(d => d.YGPA !== null ? d.YGPA.toFixed(2) : null), // Use null for semesters without YGPA
        borderColor: 'rgb(255, 99, 132)',
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

          {overallStudentRank && studentData && studentData.length > 0 && (
            <div className="bg-gray-700 p-6 rounded-lg shadow-md mb-8">
                <h3 className="text-2xl font-semibold mb-4 text-white">Overall Performance Overview</h3>
                <p className="text-lg text-gray-200">
                    Your current CGPA: <span className="font-bold text-blue-300">{overallStudentRank.cgpa.toFixed(2)}</span>
                </p>
                {overallStudentRank.totalStudents > 0 && (
                    <p className="text-lg text-gray-200">
                        Rank (Last Semester): <span className="font-bold text-blue-300">{overallStudentRank.rank} of {overallStudentRank.totalStudents}</span>
                        <span className="ml-4">Average GPA (Last Semester): <span className="font-bold text-blue-300">{overallStudentRank.averageCGPA.toFixed(2)}</span></span>
                    </p>
                )}
                <p className="text-sm text-gray-400 mt-2">
                    Note: Overall rank and average are based on the last available semester's data.
                </p>
            </div>
          )}

          {studentData && studentData.length > 0 ? (
            <div className="mt-8 space-y-8">
              <h3 className="text-2xl font-semibold mb-4 text-white">Student Results Overview by Semester</h3>
              <div className="overflow-x-auto bg-gray-700 rounded-lg shadow-md">
                <table className="min-w-full table-auto text-left">
                  <thead className="bg-gray-600">
                    <tr>
                      <th className="px-6 py-3 text-sm font-medium text-gray-200 uppercase tracking-wider">Semester</th>
                      <th className="px-6 py-3 text-sm font-medium text-gray-200 uppercase tracking-wider">GPA</th>
                      <th className="px-6 py-3 text-sm font-medium text-gray-200 uppercase tracking-wider">CGPA</th>
                      <th className="px-6 py-3 text-sm font-medium text-gray-200 uppercase tracking-wider">YGPA</th>
                      <th className="px-6 py-3 text-sm font-medium text-gray-200 uppercase tracking-wider">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-600">
                    {studentData.map((s, index) => (
                      <React.Fragment key={index}>
                        <tr
                          className="hover:bg-gray-600 transition-colors duration-200 cursor-pointer"
                          onClick={() => setExpandedSemester(expandedSemester === index ? null : index)}
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-100">{s.Semester}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-100">{s.GPA.toFixed(2)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-100">{s.CGPA !== null ? s.CGPA.toFixed(2) : '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-100">{s.YGPA !== null ? s.YGPA.toFixed(2) : '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-100">
                            <button className="text-blue-300 hover:text-blue-100 font-semibold">
                              {expandedSemester === index ? 'Hide Details' : 'Show Details'}
                            </button>
                          </td>
                        </tr>
                        {expandedSemester === index && (
                          <tr>
                            <td colSpan="5" className="p-4 bg-gray-600">
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                                {/* Semester Analytics */}
                                <div className="p-3 bg-gray-700 rounded-lg">
                                  <h4 className="font-semibold text-blue-200 mb-2">Semester Analytics</h4>
                                  <p>Average GPA: <span className="font-bold">{s.SemesterAverageGPA !== null ? s.SemesterAverageGPA.toFixed(2) : '-'}</span></p>
                                  <p>Your Rank: <span className="font-bold">
                                    {s.StudentRank > 0 && s.TotalStudentsInSemester > 0
                                      ? `${s.StudentRank} of ${s.TotalStudentsInSemester}`
                                      : '-'
                                    }
                                  </span></p>
                                </div>

                                {/* Yearly Analytics */}
                                <div className="p-3 bg-gray-700 rounded-lg">
                                  <h4 className="font-semibold text-blue-200 mb-2">Yearly Analytics</h4>
                                  <p>Average YGPA: <span className="font-bold">{s.YearlyAverageGPA !== null ? s.YearlyAverageGPA.toFixed(2) : '-'}</span></p>
                                  <p>Your Rank: <span className="font-bold">
                                    {s.StudentYearRank > 0 && s.TotalStudentsInYear > 0
                                      ? `${s.StudentYearRank} of ${s.TotalStudentsInYear}`
                                      : '-'
                                    }
                                  </span></p>
                                </div>

                                {/* Courses & Grades */}
                                <div className="p-3 bg-gray-700 rounded-lg lg:col-span-1">
                                  <h4 className="font-semibold text-blue-200 mb-2">Courses & Grades</h4>
                                  {s.CourseDetails && s.CourseDetails.length > 0 ? (
                                    <ul className="list-disc list-inside space-y-1">
                                      {s.CourseDetails.map((course, idx) => (
                                        <li key={idx}>
                                          {course.courseCode}: <span className="font-bold">{course.gradeLetter} ({course.gradePoint.toFixed(2)})</span>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p>No course details available.</p>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {studentGpaData && (
                <ResultTrendChart
                  labels={studentGpaData.labels}
                  datasets={studentGpaData.datasets}
                  title="Student GPA/CGPA/YGPA Trend"
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
              placeholder="Enter Course Code (e.g., 305 for 3rd year 1st semester 5th course)"
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