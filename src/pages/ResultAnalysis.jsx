import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient'; // Ensure this path is correct
import ResultTrendChart from '../components/ResultTrendChart';
import {
  gradeToGpa,
  COURSE_CREDITS,
  COURSES_PER_SEMESTER,
  fetchExistingTableNames,
  getSubjectCodesForAcademicSemester,
  getGradePoint
} from '../lib/dataUtils';

// Log component render for debugging blank screen issues
console.log('ResultAnalysis component rendering...');

export default function ResultAnalysis() {
  const [studentId, setStudentId] = useState('2112135101'); // Default student ID for auto-search
  const [studentData, setStudentData] = useState(null);
  const [overallStudentRank, setOverallStudentRank] = useState(null);
  const [topStudents, setTopStudents] = useState([]);
  const [nearbyStudents, setNearbyStudents] = useState([]); // New state for students around the current one
  const [batchAverageCgpa, setBatchAverageCgpa] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedSemester, setExpandedSemester] = useState(null);

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
    return totalCredits > 0 ? parseFloat((totalPoints / totalCredits).toFixed(2)) : 0.00;
  }, []);

  // Helper to calculate CGPA from processed semester data
  const calculateCgpaFromSemesters = useCallback((semesters) => {
    let overallTotalPoints = 0;
    let overallTotalCredits = 0;
    Object.values(semesters).forEach(sem => {
      overallTotalPoints += sem.totalPoints;
      overallTotalCredits += sem.totalCredits;
    });
    return overallTotalCredits > 0 ? parseFloat((overallTotalPoints / overallTotalCredits).toFixed(2)) : 0.00;
  }, []);

  // Helper to calculate YGPA from processed year data
  const calculateYgpaFromYears = useCallback((years) => {
    let overallTotalPoints = 0;
    let overallTotalCredits = 0;
    Object.values(years).forEach(year => {
      overallTotalPoints += year.totalPoints;
      overallTotalCredits += year.totalCredits;
    });
    return overallTotalCredits > 0 ? parseFloat((overallTotalPoints / overallTotalCredits).toFixed(2)) : 0.00;
  }, []);

  // This is the core data fetching and processing logic for a single student
  const fetchAndProcessStudentData = useCallback(async () => {
    // Clear all relevant states at the beginning of a new search
    setError('');
    setLoading(true);
    setStudentData(null); // Explicitly set to null to ensure re-render of initial state if no data found
    setOverallStudentRank(null);
    setTopStudents([]);
    setNearbyStudents([]); // Clear nearby students
    setBatchAverageCgpa(null);

    // Validate student ID length
    if (studentId.trim().length !== 10) {
      setError('Please enter a valid 10-digit Student ID.');
      setLoading(false);
      return;
    }

    // Crucial check: Is supabase initialized?
    if (!supabase || typeof supabase.from !== 'function') {
      console.error('Supabase client is not properly initialized. Check supabaseClient.js and Vercel environment variables.');
      setError('Application error: Supabase connection failed. Please contact support.');
      setLoading(false);
      return;
    }

    // Fetch all existing table names from the metadata table
    const allExistingTablesMetadata = await fetchExistingTableNames();
    console.log("Fetched metadata tables:", allExistingTablesMetadata);

    const allQueryPromises = [];

    // Filter tables relevant to the student ID and create promises
    allExistingTablesMetadata.forEach(meta => {
      // Dynamically select columns based on academic year and semester for the individual student query
      const subjectCodesForSemester = getSubjectCodesForAcademicSemester(meta.academic_year, meta.academic_semester);
      const selectColumnsForSingleStudent = ['*', '"Roll no."', 'Name', ...subjectCodesForSemester.map(code => `"${code}"`)];

      allQueryPromises.push({
        tableName: meta.table_name,
        academicYear: meta.academic_year,
        academicSemester: meta.academic_semester,
        examYear: meta.exam_year,
        type: meta.result_type,
        promise: supabase.from(meta.table_name).select(selectColumnsForSingleStudent.join(',')).eq('"Roll no."', studentId)
      });
    });

    console.log("All individual Supabase query promises for single student:", allQueryPromises.length);

    let results = [];
    let studentNameFound = `Student ${studentId}`; // Default name
    try {
      const responses = await Promise.allSettled(allQueryPromises.map(q => q.promise));

      responses.forEach((response, index) => {
        if (response.status === 'fulfilled' && response.value.data && response.value.data.length > 0) {
          const recordData = response.value.data[0];
          results.push({
            tableName: allQueryPromises[index].tableName,
            academicYear: allQueryPromises[index].academicYear,
            academicSemester: allQueryPromises[index].academicSemester,
            examYear: allQueryPromises[index].examYear,
            type: allQueryPromises[index].type,
            data: recordData
          });
          // Capture student name from the first successful record
          if (recordData.Name && studentNameFound === `Student ${studentId}`) {
            studentNameFound = recordData.Name;
          }
        } else {
          console.warn(`Query for ${allQueryPromises[index].tableName} failed or returned no data:`, response.reason || 'No data');
        }
      });
      console.log("Successful query results for student:", results);

    } catch (err) {
      console.error("Error fetching student data concurrently:", err);
      setError('Failed to fetch student data. Please try again.');
      setLoading(false);
      return;
    }

    const processedRawStudentRecords = {};
    let foundAnyData = false;

    results.forEach(record => {
      foundAnyData = true;
      const { academicYear, academicSemester, examYear, type, data } = record;
      const semesterKey = `${academicYear}-${academicSemester}`;

      if (!processedRawStudentRecords[semesterKey]) {
        processedRawStudentRecords[semesterKey] = {
          examYear: -1,
          type: '',
          grades: {},
          gpa: 0.00, // Initialize
          ygpa: 0.00 // Initialize
        };
      }

      if (type === 'R') {
        if (examYear > processedRawStudentRecords[semesterKey].examYear) {
          processedRawStudentRecords[semesterKey] = {
            examYear: examYear,
            type: 'R',
            grades: {},
            gpa: data.GPA,
            ygpa: data.YGPA
          };
          const subjectCodes = getSubjectCodesForAcademicSemester(academicYear, academicSemester);
          subjectCodes.forEach(code => {
            if (data[code] !== undefined) {
              processedRawStudentRecords[semesterKey].grades[code] = data[code];
            }
          });
        }
      } else if (type === 'I') {
        const improvementRecord = data;
        const subjectCodes = getSubjectCodesForAcademicSemester(academicYear, academicSemester);

        subjectCodes.forEach(code => {
          const improvedGrade = improvementRecord[code];
          if (improvedGrade !== undefined) {
            const currentGrade = processedRawStudentRecords[semesterKey].grades[code];
            const currentGradePoint = getGradePoint(currentGrade);
            const improvedGradePoint = getGradePoint(improvedGrade);

            const isEligibleForImprovement = currentGradePoint < getGradePoint('B-') || currentGrade === 'F';

            if (isEligibleForImprovement && improvedGradePoint > currentGradePoint) {
              processedRawStudentRecords[semesterKey].grades[code] = improvedGrade;
            } else if (currentGrade === undefined && improvedGradePoint > 0) {
               processedRawStudentRecords[semesterKey].grades[code] = improvedGrade;
            }
          }
        });
      }
    });

    console.log("Processed raw student records after re-add/improvement logic:", processedRawStudentRecords);

    if (!foundAnyData) {
      setError(`No data found for Student ID: ${studentId}. Please check the ID.`);
      setLoading(false);
      return;
    }

    const finalProcessedSemesters = {};
    const semesterLabels = [];
    const studentGpaHistory = [];
    const studentCgpaHistory = [];
    const studentYgpaHistory = [];

    const chronologicalSemesterKeys = Object.keys(processedRawStudentRecords).sort((a, b) => {
      const [yearA, semA] = a.split('-').map(Number);
      const [yearB, semB] = b.split('-').map(Number);
      if (yearA !== yearB) return yearA - yearB;
      return semA - semB;
    });

    let currentCgpaAccumulator = { totalPoints: 0, totalCredits: 0 };
    let currentYearAccumulator = { totalPoints: 0, totalCredits: 0 };
    let lastProcessedYear = null;

    for (const semesterKey of chronologicalSemesterKeys) {
      const [academicYear, academicSemesterNum] = semesterKey.split('-').map(Number);
      const semesterDisplayName = `${academicYear} Year ${academicSemesterNum === 1 ? '1st' : '2nd'} Semester`;
      semesterLabels.push(semesterDisplayName);

      const gradesMap = processedRawStudentRecords[semesterKey].grades;
      const subjectCodes = Object.keys(gradesMap);

      let semesterTotalPoints = 0;
      let semesterTotalCredits = 0;
      const courseDetails = [];

      subjectCodes.forEach(code => {
        const gradeLetter = gradesMap[code];
        const gradePoint = getGradePoint(gradeLetter);
        const credit = COURSE_CREDITS;
        semesterTotalPoints += gradePoint * credit;
        semesterTotalCredits += credit;
        courseDetails.push({ courseCode: code, gradeLetter, gradePoint });
      });

      const semesterGpa = semesterTotalCredits > 0 ? parseFloat((semesterTotalPoints / semesterTotalCredits).toFixed(2)) : 0.00;

      currentCgpaAccumulator.totalPoints += semesterTotalPoints;
      currentCgpaAccumulator.totalCredits += semesterTotalCredits;
      const currentCgpa = calculateCgpaFromSemesters({ current: currentCgpaAccumulator });

      if (lastProcessedYear === null || lastProcessedYear !== academicYear) {
        currentYearAccumulator = { totalPoints: 0, totalCredits: 0 };
        lastProcessedYear = academicYear;
      }
      currentYearAccumulator.totalPoints += semesterTotalPoints;
      currentYearAccumulator.totalCredits += semesterTotalCredits;
      const currentYgpa = currentYearAccumulator.totalCredits > 0 ? parseFloat((currentYearAccumulator.totalPoints / currentYearAccumulator.totalCredits).toFixed(2)) : 0.00;


      finalProcessedSemesters[semesterKey] = {
        semesterDisplayName,
        gpa: semesterGpa,
        cgpa: currentCgpa,
        ygpa: currentYgpa,
        courseDetails,
        totalPoints: semesterTotalPoints,
        totalCredits: semesterTotalCredits,
      };

      studentGpaHistory.push(semesterGpa);
      studentCgpaHistory.push(currentCgpa);
      studentYgpaHistory.push(currentYgpa);
    }

    const studentGpaData = {
      labels: semesterLabels,
      datasets: [
        {
          label: 'Your GPA',
          data: studentGpaHistory,
          borderColor: 'rgba(0, 123, 255, 1)',
          backgroundColor: 'rgba(0, 123, 255, 0.2)',
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Your CGPA',
          data: studentCgpaHistory,
          borderColor: 'rgba(40, 167, 69, 1)',
          backgroundColor: 'rgba(40, 167, 69, 0.2)',
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Your YGPA',
          data: studentYgpaHistory,
          borderColor: 'rgba(255, 193, 7, 1)',
          backgroundColor: 'rgba(255, 193, 7, 0.2)',
          fill: true,
          tension: 0.3,
        },
      ],
    };

    setStudentData({
      id: studentId,
      name: studentNameFound, // Use the fetched student name
      semesters: finalProcessedSemesters,
      gpaTrend: studentGpaData,
      overallCgpa: currentCgpaAccumulator.totalCredits > 0 ? parseFloat((currentCgpaAccumulator.totalPoints / currentCgpaAccumulator.totalCredits).toFixed(2)) : 0.00,
    });

    setLoading(false);
  }, [studentId, calculateGpa, calculateCgpaFromSemesters, calculateYgpaFromYears]);

  // New function to calculate overall ranks for all students
  const calculateOverallRank = useCallback(async () => {
    console.log("Starting overall rank calculation...");
    let allStudentsRawData = {}; // { 'studentId': [{tableName: '...', data: {...}}, ...], ... }

    // Crucial check: Is supabase initialized?
    if (!supabase || typeof supabase.from !== 'function') {
      console.error('Supabase client is not properly initialized for rank calculation. Check supabaseClient.js and Vercel environment variables.');
      setOverallStudentRank('Error'); // Indicate error for rank
      setBatchAverageCgpa('Error');
      return;
    }

    const allExistingTablesMetadata = await fetchExistingTableNames();
    const allStudentQueryPromises = [];

    // Determine the latest academic year and semester from metadata
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

    // Generate all required semester keys up to the latest one
    const requiredSemesterKeys = new Set();
    for (let y = 1; y <= maxAcademicYear; y++) {
      for (let s = 1; s <= 2; s++) { // Assuming only 2 semesters per year
        if (y < maxAcademicYear || (y === maxAcademicYear && s <= maxAcademicSemester)) {
          requiredSemesterKeys.add(`${y}-${s}`);
        }
      }
    }
    console.log("Required semester keys for completeness:", Array.from(requiredSemesterKeys));


    allExistingTablesMetadata.forEach(meta => {
      // Dynamically get subject codes for the specific academic year and semester of this table
      const subjectCodesForTable = getSubjectCodesForAcademicSemester(meta.academic_year, meta.academic_semester);
      // Include "Roll no." and "Name" in the select columns for all student data
      const selectColumnsForTable = ['"Roll no."', 'Name', ...subjectCodesForTable.map(code => `"${code}"`)];

      allStudentQueryPromises.push({
        tableName: meta.table_name,
        academicYear: meta.academic_year,
        academicSemester: meta.academic_semester,
        examYear: meta.exam_year,
        type: meta.result_type,
        promise: supabase.from(meta.table_name).select(selectColumnsForTable.join(','))
      });
    });

    try {
      const responses = await Promise.allSettled(allStudentQueryPromises.map(q => q.promise));

      responses.forEach((response, index) => {
        if (response.status === 'fulfilled' && response.value.data && response.value.data.length > 0) {
          const { tableName, academicYear, academicSemester, examYear, type } = allStudentQueryPromises[index];
          response.value.data.forEach(studentRecord => {
            const studentRoll = studentRecord['Roll no.']; // Access with bracket notation for spaces
            if (!allStudentsRawData[studentRoll]) {
              allStudentsRawData[studentRoll] = {
                name: studentRecord.Name || `Student ${studentRoll}`, // Capture name
                records: []
              };
            }
            allStudentsRawData[studentRoll].records.push({
              tableName, academicYear, academicSemester, examYear, type, data: studentRecord
            });
          });
        } else {
          console.warn(`Query for ${allStudentQueryPromises[index].tableName} failed or returned no data for rank calculation:`, response.reason || 'No data');
        }
      });
      console.log("Raw data collected for all students:", Object.keys(allStudentsRawData).length);

      // Now process each student's raw data to get their final grades and CGPA
      const allStudentsCgpas = []; // [{ studentId: '...', name: '...', cgpa: X.XX, isComplete: boolean }, ...]

      for (const studentRoll in allStudentsRawData) {
        const student = allStudentsRawData[studentRoll];
        const processedSemestersForThisStudent = {};

        student.records.forEach(record => {
          const { academicYear, academicSemester, examYear, type, data } = record;
          const semesterKey = `${academicYear}-${academicSemester}`;

          if (!processedSemestersForThisStudent[semesterKey]) {
            processedSemestersForThisStudent[semesterKey] = {
              examYear: -1,
              type: '',
              grades: {},
            };
          }

          if (type === 'R') {
            if (examYear > processedSemestersForThisStudent[semesterKey].examYear) {
              processedSemestersForThisStudent[semesterKey] = {
                examYear: examYear,
                type: 'R',
                grades: {},
              };
              const subjectCodes = getSubjectCodesForAcademicSemester(academicYear, academicSemester);
              subjectCodes.forEach(code => {
                if (data[code] !== undefined) {
                  processedSemestersForThisStudent[semesterKey].grades[code] = data[code];
                }
              });
            }
          } else if (type === 'I') {
            const improvementRecord = data;
            const subjectCodes = getSubjectCodesForAcademicSemester(academicYear, academicSemester);

            subjectCodes.forEach(code => {
              const improvedGrade = improvementRecord[code];
              if (improvedGrade !== undefined) {
                const currentGrade = processedSemestersForThisStudent[semesterKey].grades[code];
                const currentGradePoint = getGradePoint(currentGrade);
                const improvedGradePoint = getGradePoint(improvedGrade);

                const isEligibleForImprovement = currentGradePoint < getGradePoint('B-') || currentGrade === 'F';

                if (isEligibleForImprovement && improvedGradePoint > currentGradePoint) {
                  processedSemestersForThisStudent[semesterKey].grades[code] = improvedGrade;
                } else if (currentGrade === undefined && improvedGradePoint > 0) {
                  processedSemestersForThisStudent[semesterKey].grades[code] = improvedGrade;
                }
              }
            });
          }
        });

        // Calculate CGPA for this student based on their processed semesters
        let studentTotalPoints = 0;
        let studentTotalCredits = 0;
        const sortedSemesterKeys = Object.keys(processedSemestersForThisStudent).sort((a, b) => {
          const [yearA, semA] = a.split('-').map(Number);
          const [yearB, semB] = b.split('-').map(Number);
          if (yearA !== yearB) return yearA - yearB;
          return semA - semB;
        });

        for (const semesterKey of sortedSemesterKeys) {
          const gradesMap = processedSemestersForThisStudent[semesterKey].grades;
          Object.values(gradesMap).forEach(gradeLetter => {
            const gradePoint = getGradePoint(gradeLetter);
            const credit = COURSE_CREDITS;
            studentTotalPoints += gradePoint * credit;
            studentTotalCredits += credit;
          });
        }
        const studentCgpa = studentTotalCredits > 0 ? parseFloat((studentTotalPoints / studentTotalCredits).toFixed(2)) : 0.00;

        // Determine if the student has records for all required semesters
        const studentSemesterKeys = new Set(Object.keys(processedSemestersForThisStudent));
        const hasAllRequiredSemesters = Array.from(requiredSemesterKeys).every(key => studentSemesterKeys.has(key));

        allStudentsCgpas.push({
          studentId: studentRoll,
          name: student.name,
          cgpa: studentCgpa,
          isComplete: hasAllRequiredSemesters // Mark if student has all required semesters
        });
      }

      // Filter for complete students for ranking and batch average
      const completeStudentsCgpas = allStudentsCgpas.filter(s => s.isComplete);
      console.log("Complete students for ranking:", completeStudentsCgpas.length);

      // Calculate Batch Average CGPA
      const totalCgpaSum = completeStudentsCgpas.reduce((sum, s) => sum + s.cgpa, 0);
      const averageCgpa = completeStudentsCgpas.length > 0 ? (totalCgpaSum / completeStudentsCgpas.length).toFixed(2) : 'N/A';
      setBatchAverageCgpa(averageCgpa);


      // Sort complete students by CGPA to determine rank
      completeStudentsCgpas.sort((a, b) => b.cgpa - a.cgpa);

      // Assign ranks, handling ties and preparing display string
      let currentRank = 1;
      let prevCgpa = -1; // Initialize with a value lower than any possible CGPA

      for (let i = 0; i < completeStudentsCgpas.length; i++) {
        if (completeStudentsCgpas[i].cgpa < prevCgpa) {
          currentRank = i + 1;
        }
        completeStudentsCgpas[i].rank = currentRank;
        prevCgpa = completeStudentsCgpas[i].cgpa;
      }

      // Calculate rank string for the current student
      const totalCompleteStudents = completeStudentsCgpas.length;
      const currentStudentRankData = completeStudentsCgpas.find(s => s.studentId === studentId);

      if (currentStudentRankData) {
        const rankStart = currentStudentRankData.rank;
        let rankEnd = rankStart; // Initialize rankEnd with rankStart

        // Find the actual last rank in the tied group
        // Iterate from the current student's position to find the last student with the same CGPA
        for (let i = completeStudentsCgpas.indexOf(currentStudentRankData); i < completeStudentsCgpas.length; i++) {
            if (completeStudentsCgpas[i].cgpa === currentStudentRankData.cgpa) {
                rankEnd = completeStudentsCgpas[i].rank; // This will be the rank of the last student in the tied group
            } else {
                break; // Stop if CGPA changes
            }
        }

        let rankDisplayString;
        if (rankStart === rankEnd) {
          rankDisplayString = `${rankStart} of ${totalCompleteStudents}`;
        } else {
          // Corrected to show full range (e.g., 100-108)
          rankDisplayString = `${rankStart}-${rankEnd} of ${totalCompleteStudents}`;
        }
        setOverallStudentRank(rankDisplayString);

        // Also update the student's name if it was fetched here and is still the placeholder
        setStudentData(prevData => {
            if (prevData && prevData.name === `Student ${studentId}`) {
                return { ...prevData, name: currentStudentRankData.name };
            }
            return prevData;
        });
      } else {
        // If the current student is not in the complete list, they have missing semesters
        setOverallStudentRank('N/A (Missing Semesters)');
        // Ensure studentData's overallCgpa is set to N/A if semesters are missing
        setStudentData(prevData => ({
          ...prevData,
          overallCgpa: 'N/A' // Set individual student's CGPA to N/A
        }));
      }

      // Get top 5 students from the complete list
      const top5 = completeStudentsCgpas.slice(0, 5).map(s => ({
        id: s.studentId,
        name: s.name,
        cgpa: s.cgpa,
        rank: s.rank // Include rank for display if desired
      }));
      setTopStudents(top5); // Set new state for top students

      // Get 10 students around the current student (5 before, 5 after)
      const currentStudentIndex = completeStudentsCgpas.findIndex(s => s.studentId === studentId);
      if (currentStudentIndex !== -1) {
        const startIndex = Math.max(0, currentStudentIndex - 5);
        const endIndex = Math.min(completeStudentsCgpas.length, currentStudentIndex + 5 + 1); // +1 because slice end is exclusive
        setNearbyStudents(completeStudentsCgpas.slice(startIndex, endIndex));
      } else {
        setNearbyStudents([]); // Clear if current student not found in complete list
      }


    } catch (err) {
      console.error("Error calculating overall ranks:", err);
      setOverallStudentRank('Error'); // Indicate error for rank
      setTopStudents([]); // Clear top students on error
      setNearbyStudents([]); // Clear nearby students on error
      setBatchAverageCgpa('Error');
    }
    console.log("Overall rank calculation finished.");
  }, [studentId, calculateGpa, calculateCgpaFromSemesters]);


  // Effect to trigger initial search on component mount with the default studentId
  useEffect(() => {
    // Only trigger if studentId is not empty (i.e., it's the default or a valid input)
    // and no search has been performed yet (studentData is null)
    if (studentId.trim().length === 10 && !studentData && !loading && !error) {
      fetchAndProcessStudentData();
    }
  }, [studentId, studentData, loading, error, fetchAndProcessStudentData]); // Added dependencies

  // Trigger overall rank calculation after studentData is loaded
  useEffect(() => {
    if (studentData) { // Only run if studentData has been successfully fetched
        calculateOverallRank();
    }
  }, [studentData, calculateOverallRank]);


  const toggleSemesterExpansion = (semesterKey) => {
    setExpandedSemester(expandedSemester === semesterKey ? null : semesterKey);
  };

  return (
    // Removed the 'key' prop from the section to prevent re-mounting on every studentId change
    // This should fix the input focus issue and potentially help with blank screens.
    <section className="container mx-auto p-4 pt-16 text-white">
      <h1 className="text-3xl font-bold mb-6 text-center">Student Result Analysis</h1>

      <div className="bg-gray-800 p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-2xl font-semibold mb-4">Search Student Results</h2>
        <div className="flex items-center space-x-4">
          <input
            type="text"
            placeholder="Enter a 10-digit Student ID (e.g., 2112135101)" // Updated placeholder
            className="p-3 border border-gray-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex-grow"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            maxLength={10} // Enforce max length
          />
          <button
            onClick={fetchAndProcessStudentData}
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          >
            {loading ? 'Searching...' : 'Show Student Data'}
          </button>
        </div>
        {/* Display general error messages more prominently */}
        {error && <p className="text-red-500 mt-4 text-center font-bold">{error}</p>}
        {loading && <p className="text-blue-400 mt-4 text-center">Loading student data...</p>}
      </div>

      {/* Conditional rendering based on loading, error, and studentData state */}
      {loading ? (
        <div className="bg-gray-800 p-6 rounded-lg shadow-md text-center text-blue-400">
          <p>Loading student data...</p>
        </div>
      ) : error ? (
        <div className="bg-gray-800 p-6 rounded-lg shadow-md text-center text-red-500">
          <p>{error}</p>
        </div>
      ) : studentData ? (
        <div className="bg-gray-800 p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold mb-4 text-center">Results for Student ID: {studentData.id} ({studentData.name})</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-gray-700 p-4 rounded-md text-center">
              <p className="text-lg font-medium">Overall CGPA:</p>
              <p className="text-4xl font-bold text-green-400">{studentData.overallCgpa}</p>
            </div>
            <div className="bg-gray-700 p-4 rounded-md text-center">
              <p className="text-lg font-medium">Overall Rank:</p>
              <p className="text-4xl font-bold text-blue-400">{overallStudentRank || 'N/A'}</p>
            </div>
            <div className="bg-gray-700 p-4 rounded-md text-center">
              <p className="text-lg font-medium">Batch Avg. CGPA:</p>
              <p className="text-4xl font-bold text-purple-400">{batchAverageCgpa || 'N/A'}</p>
            </div>
          </div>

          <h3 className="text-xl font-semibold mb-4 text-center mt-8">Top Students by CGPA</h3>
          {topStudents.length > 0 ? (
            <div className="overflow-x-auto mb-8">
              <table className="min-w-full bg-gray-700 rounded-lg text-left text-white">
                <thead>
                  <tr>
                    <th className="py-3 px-4 border-b border-gray-600">Rank</th>
                    <th className="py-3 px-4 border-b border-gray-600">Student ID</th>
                    <th className="py-3 px-4 border-b border-gray-600">Name</th>
                    <th className="py-3 px-4 border-b border-gray-600">CGPA</th>
                  </tr>
                </thead>
                <tbody>
                  {topStudents.map((student, index) => (
                    <tr key={student.id} className="hover:bg-gray-600">
                      <td className="py-2 px-4 border-b border-gray-600">{student.rank}</td>
                      <td className="py-2 px-4 border-b border-gray-600">{student.id}</td>
                      <td className="py-2 px-4 border-b border-gray-600">{student.name}</td>
                      <td className="py-2 px-4 border-b border-gray-600">{student.cgpa}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-300 text-center mb-8">Top student data not available or loading...</p>
          )}

          {/* New section for students before and after the current student */}
          {nearbyStudents.length > 0 && (
            <div className="mt-8">
              <h3 className="text-xl font-semibold mb-4 text-center">Students Around Current Rank</h3>
              <div className="overflow-x-auto mb-8">
                <table className="min-w-full bg-gray-700 rounded-lg text-left text-white">
                  <thead>
                    <tr>
                      <th className="py-3 px-4 border-b border-gray-600">Rank</th>
                      <th className="py-3 px-4 border-b border-gray-600">Student ID</th>
                      <th className="py-3 px-4 border-b border-gray-600">Name</th>
                      <th className="py-3 px-4 border-b border-gray-600">CGPA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nearbyStudents.map((student, index) => (
                      <tr key={student.studentId} className={`hover:bg-gray-600 ${student.studentId === studentId ? 'bg-blue-700 font-bold' : ''}`}>
                        <td className="py-2 px-4 border-b border-gray-600">{student.rank}</td>
                        <td className="py-2 px-4 border-b border-gray-600">{student.studentId}</td> {/* Corrected to student.studentId */}
                        <td className="py-2 px-4 border-b border-gray-600">{student.name}</td>
                        <td className="py-2 px-4 border-b border-gray-600">{student.cgpa}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <h3 className="text-xl font-semibold mb-4 text-center">GPA/CGPA/YGPA Trend</h3>
          {studentData.gpaTrend && (
            <ResultTrendChart
              labels={studentData.gpaTrend.labels}
              datasets={studentData.gpaTrend.datasets}
              title="Student Academic Performance Trend"
            />
          )}

          <h3 className="text-xl font-semibold mb-4 text-center mt-8">Semester-wise Details</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-gray-700 rounded-lg text-left text-white">
              <thead>
                <tr>
                  <th className="py-3 px-4 border-b border-gray-600">Semester</th>
                  <th className="py-3 px-4 border-b border-gray-600">GPA</th>
                  <th className="py-3 px-4 border-b border-gray-600">CGPA</th>
                  <th className="py-3 px-4 border-b border-gray-600">YGPA</th>
                  <th className="py-3 px-4 border-b border-gray-600">Details</th>
                </tr>
              </thead>
              <tbody>
                {/* Ensure studentData.semesters is an object before calling Object.entries */}
                {studentData.semesters && Object.entries(studentData.semesters).map(([semesterKey, sem]) => (
                  <React.Fragment key={semesterKey}>
                    <tr
                      className="hover:bg-gray-600 cursor-pointer"
                      onClick={() => toggleSemesterExpansion(semesterKey)}
                    >
                      <td className="py-2 px-4 border-b border-gray-600">{sem.semesterDisplayName}</td>
                      <td className="py-2 px-4 border-b border-gray-600">{sem.gpa}</td>
                      <td className="py-2 px-4 border-b border-gray-600">{sem.cgpa}</td>
                      <td className="py-2 px-4 border-b border-gray-600">{sem.ygpa}</td>
                      <td className="py-2 px-4 border-b border-gray-600">
                        {expandedSemester === semesterKey ? '▲ Hide' : '▼ Show'}
                      </td>
                    </tr>
                    {expandedSemester === semesterKey && (
                      <tr>
                        <td colSpan="5" className="py-4 px-4 bg-gray-600">
                          <h4 className="text-lg font-semibold mb-2 text-gray-200">Courses & Grades</h4>
                          {sem.courseDetails && sem.courseDetails.length > 0 ? (
                            <ul className="list-disc list-inside space-y-1 text-gray-100">
                              {sem.courseDetails.map((course, idx) => (
                                <li key={idx}>
                                  {course.courseCode}: <span className="font-bold">{course.gradeLetter} ({course.gradePoint.toFixed(2)})</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-gray-300">No course details available.</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // This block will render if studentData is null (initial state or no results) and no error is present
        !loading && !error && (
          <div className="bg-gray-800 p-6 rounded-lg shadow-md text-center text-gray-300">
            <p>Enter a Student ID and click "Show Student Data" to view results.</p>
          </div>
        )
      )}
    </section>
  );
}
