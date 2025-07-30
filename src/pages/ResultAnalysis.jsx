import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient'; // Ensure this path is correct
import ResultTrendChart from '../components/ResultTrendChart';
import {
  COURSE_CREDITS,
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
  const [nearbyStudents, setNearbyStudents] = useState([]);
  const [batchAverageCgpa, setBatchAverageCgpa] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedSemester, setExpandedSemester] = useState(null);

  // New states for chart averages
  const [gpaChartData, setGpaChartData] = useState(null);
  const [cgpaChartData, setCgpaChartData] = useState(null);

  // New states for caching all batch data (fetched once)
  const [allProcessedBatchData, setAllProcessedBatchData] = useState(null);
  // Removed allBatchCourseMetrics as it's no longer needed for display
  const [requiredSemesterKeysGlobal, setRequiredSemesterKeysGlobal] = useState([]); // To store required semester keys globally

  // New state for expected improvement grades
  const [expectedGrades, setExpectedGrades] = useState({}); // { 'semesterKey-courseCode': 'ExpectedGradeLetter' }

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
  // This function is still responsible for fetching data for the *currently searched* student
  const fetchAndProcessStudentData = useCallback(async () => {
    // Clear all relevant states at the beginning of a new search
    setError('');
    setLoading(true);
    setStudentData(null); // Explicitly set to null to ensure re-render of initial state if no data found
    setOverallStudentRank(null);
    setTopStudents([]);
    setNearbyStudents([]);
    setBatchAverageCgpa(null);
    setGpaChartData(null); // Clear chart data
    setCgpaChartData(null); // Clear chart data
    setExpectedGrades({}); // Clear expected grades on new search

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
    console.log("Fetched metadata tables for single student search:", allExistingTablesMetadata);

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
          grades: {}, // This will store the *best* grade found for each course
          originalGrades: {}, // This will store the original 'R' grade for improvement check
          gpa: 0.00, // Initialize
          ygpa: 0.00 // Initialize
        };
      }

      if (type === 'R') {
        // For Regular records, keep only the latest exam year's data
        if (examYear > processedRawStudentRecords[semesterKey].examYear) {
          processedRawStudentRecords[semesterKey] = {
            examYear: examYear,
            type: 'R',
            grades: {}, // Will be populated below
            originalGrades: {}, // Will be populated below
            gpa: data.GPA,
            ygpa: data.YGPA
          };
          const subjectCodes = getSubjectCodesForAcademicSemester(academicYear, academicSemester);
          subjectCodes.forEach(code => {
            if (data[code] !== undefined) {
              processedRawStudentRecords[semesterKey].grades[code] = data[code];
              processedRawStudentRecords[semesterKey].originalGrades[code] = data[code]; // Store original
            }
          });
        }
      } else if (type === 'I') {
        // For Improvement records, apply on top of existing regular grades if they exist
        const improvementRecord = data;
        const subjectCodes = getSubjectCodesForAcademicSemester(academicYear, academicSemester);

        subjectCodes.forEach(code => {
          const improvedGrade = improvementRecord[code];
          if (improvedGrade !== undefined) {
            const currentGrade = processedRawStudentRecords[semesterKey]?.grades[code];
            const currentGradePoint = getGradePoint(currentGrade);
            const improvedGradePoint = getGradePoint(improvedGrade);

            // Apply improvement if it's better and eligible
            const isEligibleForImprovement = currentGradePoint < getGradePoint('B-') || currentGrade === 'F';

            if (isEligibleForImprovement && improvedGradePoint > currentGradePoint) {
              processedRawStudentRecords[semesterKey].grades[code] = improvedGrade;
            } else if (currentGrade === undefined && improvedGradePoint > 0) {
               // If no regular grade existed for this course, just add the improvement grade
               processedRawStudentRecords[semesterKey].grades[code] = improvedGrade;
               processedRawStudentRecords[semesterKey].originalGrades[code] = improvedGrade; // Treat as original if no regular
            }
          }
        });
      }
    });

    console.log("Processed raw student records with original/best grades:", processedRawStudentRecords);

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
      const originalGradesMap = processedRawStudentRecords[semesterKey].originalGrades;
      const subjectCodes = getSubjectCodesForAcademicSemester(academicYear, academicSemesterNum); // Use all expected subject codes

      let semesterTotalPoints = 0;
      let semesterTotalCredits = 0;
      const courseDetails = [];

      subjectCodes.forEach(code => {
        const gradeLetter = gradesMap[code]; // Use the best grade (R or I)
        const originalGradeLetter = originalGradesMap[code] || gradeLetter; // Fallback to current if no explicit original
        const gradePoint = getGradePoint(gradeLetter);
        const credit = COURSE_CREDITS;

        semesterTotalPoints += gradePoint * credit;
        semesterTotalCredits += credit;

        courseDetails.push({
          courseCode: code,
          gradeLetter,
          gradePoint,
          originalGradeLetter: originalGradeLetter,
          hasImprovementOpportunity: getGradePoint(originalGradeLetter) < getGradePoint('B-') || originalGradeLetter === 'F'
        });
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

    setStudentData({
      id: studentId,
      name: studentNameFound, // Use the fetched student name
      semesters: finalProcessedSemesters,
      overallCgpa: currentCgpaAccumulator.totalCredits > 0 ? parseFloat((currentCgpaAccumulator.totalPoints / currentCgpaAccumulator.totalCredits).toFixed(2)) : 0.00,
    });

    setLoading(false);
  }, [studentId, calculateGpa, calculateCgpaFromSemesters, calculateYgpaFromYears]);

  // Helper function to process all students' raw data into structured semester data
  // This is now called only once on component mount for batch data.
  const processAllStudentsSemesterData = useCallback(async (allExistingTablesMetadata) => {
    console.time("processAllStudentsSemesterData"); // Start timer

    let allStudentsRawData = {};
    const allStudentQueryPromises = [];
    const allCourseGradesRaw = {}; // New object to collect all individual course grades

    // Determine the latest academic year and semester from metadata to ensure complete data
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
    const requiredSemesterKeysSet = new Set(); // Use a Set initially for uniqueness
    for (let y = 1; y <= maxAcademicYear; y++) {
      for (let s = 1; s <= 2; s++) { // Assuming only 2 semesters per year
        if (y < maxAcademicYear || (y === maxAcademicYear && s <= maxAcademicSemester)) {
          requiredSemesterKeysSet.add(`${y}-${s}`);
        }
      }
    }
    // Defensive filter to ensure only valid strings are in the array
    const requiredSemesterKeys = Array.from(requiredSemesterKeysSet).filter(k => typeof k === 'string' && k.length > 0);

    allExistingTablesMetadata.forEach(meta => {
      const subjectCodesForTable = getSubjectCodesForAcademicSemester(meta.academic_year, meta.academic_semester);
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

    const responses = await Promise.allSettled(allStudentQueryPromises.map(q => q.promise));

    responses.forEach((response, index) => {
      if (response.status === 'fulfilled' && response.value.data && response.value.data.length > 0) {
        const { tableName, academicYear, academicSemester, examYear, type } = allStudentQueryPromises[index];
        response.value.data.forEach(studentRecord => {
          const studentRoll = studentRecord['Roll no.'];
          if (!allStudentsRawData[studentRoll]) {
            allStudentsRawData[studentRoll] = {
              name: studentRecord.Name || `Student ${studentRoll}`,
              records: []
            };
          }
          allStudentsRawData[studentRoll].records.push({
            tableName, academicYear, academicSemester, examYear, type, data: studentRecord
          });

          // Collect raw course grades for all students for average and rank calculation
          const semesterKey = `${academicYear}-${academicSemester}`;
          const subjectCodesForCurrentSemester = getSubjectCodesForAcademicSemester(academicYear, academicSemester);
          subjectCodesForCurrentSemester.forEach(code => {
            const gradeLetter = studentRecord[code];
            if (gradeLetter !== undefined && gradeLetter !== null) { // Ensure grade exists
              const gradePoint = getGradePoint(gradeLetter);
              if (!allCourseGradesRaw[semesterKey]) {
                allCourseGradesRaw[semesterKey] = {};
              }
              if (!allCourseGradesRaw[semesterKey][code]) {
                allCourseGradesRaw[semesterKey][code] = [];
              }
              allCourseGradesRaw[semesterKey][code].push({ studentRoll, gradePoint });
            }
          });
        });
      }
    });

    // Process raw data into structured semester-wise GPA/CGPA for each student
    const allStudentsFullProcessedData = {};
    for (const studentRoll in allStudentsRawData) {
      const student = allStudentsRawData[studentRoll];
      const processedSemestersForThisStudent = {};
      let currentCgpaAccumulator = { totalPoints: 0, totalCredits: 0 };
      let currentYearAccumulator = { totalPoints: 0, totalCredits: 0 };
      let lastProcessedYear = null;

      // Sort records by academic year and semester for correct CGPA calculation
      const sortedRecords = student.records.sort((a, b) => {
        if (a.academicYear !== b.academicYear) return a.academicYear - b.academicYear;
        return a.academicSemester - b.academicSemester;
      });

      sortedRecords.forEach(record => {
        const { academicYear, academicSemester, examYear, type, data } = record;
        const semesterKey = `${academicYear}-${academicSemester}`;

        if (!processedSemestersForThisStudent[semesterKey]) {
          processedSemestersForThisStudent[semesterKey] = {
            examYear: -1,
            type: '',
            grades: {},
            totalPoints: 0, // Initialize
            totalCredits: 0, // Initialize
          };
        }

        if (type === 'R') {
          if (examYear > processedSemestersForThisStudent[semesterKey].examYear) {
            processedSemestersForThisStudent[semesterKey].examYear = examYear;
            processedSemestersForThisStudent[semesterKey].type = 'R';
            processedSemestersForThisStudent[semesterKey].grades = {};
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

      // Calculate GPA, CGPA, YGPA for each semester after all improvements
      const chronologicalSemesterKeysForStudent = Object.keys(processedSemestersForThisStudent).sort((a, b) => {
        const [yearA, semA] = a.split('-').map(Number);
        const [yearB, semB] = b.split('-').map(Number);
        if (yearA !== yearB) return yearA - yearB;
        return semA - semB;
      });

      currentCgpaAccumulator = { totalPoints: 0, totalCredits: 0 }; // Reset for each student
      currentYearAccumulator = { totalPoints: 0, totalCredits: 0 };
      lastProcessedYear = null;

      const studentSemesterGpas = {};
      const studentSemesterCgpas = {};

      for (const semesterKey of chronologicalSemesterKeysForStudent) {
        const [academicYear, academicSemesterNum] = semesterKey.split('-').map(Number);
        const gradesMap = processedSemestersForThisStudent[semesterKey].grades;
        let semesterTotalPoints = 0;
        let semesterTotalCredits = 0;

        Object.values(gradesMap).forEach(gradeLetter => {
          const gradePoint = getGradePoint(gradeLetter);
          const credit = COURSE_CREDITS;
          semesterTotalPoints += gradePoint * credit;
          semesterTotalCredits += credit;
        });

        const semesterGpa = semesterTotalCredits > 0 ? parseFloat((semesterTotalPoints / semesterTotalCredits).toFixed(2)) : 0.00;
        studentSemesterGpas[semesterKey] = semesterGpa;

        processedSemestersForThisStudent[semesterKey].totalPoints = semesterTotalPoints;
        processedSemestersForThisStudent[semesterKey].totalCredits = semesterTotalCredits;
        processedSemestersForThisStudent[semesterKey].gpa = semesterGpa;

        currentCgpaAccumulator.totalPoints += semesterTotalPoints;
        currentCgpaAccumulator.totalCredits += semesterTotalCredits;
        const currentCgpa = currentCgpaAccumulator.totalCredits > 0 ? parseFloat((currentCgpaAccumulator.totalPoints / currentCgpaAccumulator.totalCredits).toFixed(2)) : 0.00;
        studentSemesterCgpas[semesterKey] = currentCgpa;
        processedSemestersForThisStudent[semesterKey].cgpa = currentCgpa;


        if (lastProcessedYear === null || lastProcessedYear !== academicYear) {
          currentYearAccumulator = { totalPoints: 0, totalCredits: 0 };
          lastProcessedYear = academicYear;
        }
        currentYearAccumulator.totalPoints += semesterTotalPoints;
        currentYearAccumulator.totalCredits += semesterTotalCredits;
        processedSemestersForThisStudent[semesterKey].ygpa = currentYearAccumulator.totalCredits > 0 ? parseFloat((currentYearAccumulator.totalPoints / currentYearAccumulator.totalCredits).toFixed(2)) : 0.00;

      }

      // Calculate overall CGPA for the student
      const studentOverallCgpa = currentCgpaAccumulator.totalCredits > 0 ? parseFloat((currentCgpaAccumulator.totalPoints / currentCgpaAccumulator.totalCredits).toFixed(2)) : 0.00;

      // Determine if the student has records for all required semesters
      const studentSemesterKeys = new Set(Object.keys(processedSemestersForThisStudent));
      const hasAllRequiredSemesters = requiredSemesterKeys.every(key => studentSemesterKeys.has(key)); // Use the array version

      allStudentsFullProcessedData[studentRoll] = {
        name: student.name,
        overallCgpa: studentOverallCgpa,
        semesters: processedSemestersForThisStudent,
        isComplete: hasAllRequiredSemesters,
        gpaHistory: studentSemesterGpas, // Semester-wise GPA
        cgpaHistory: studentSemesterCgpas, // Semester-wise CGPA
      };
    }

    // Removed allCourseMetrics calculation as it's no longer needed for display
    console.timeEnd("processAllStudentsSemesterData"); // End timer
    return { allStudentsFullProcessedData, requiredSemesterKeys };
  }, [calculateGpa, calculateCgpaFromSemesters]);


  // New function to recalculate student's results based on expected grades
  const recalculateStudentResults = useCallback((currentStudentData, currentExpectedGrades) => {
    if (!currentStudentData) return null;

    const newSemesters = {};
    let overallTotalPoints = 0;
    let overallTotalCredits = 0;
    let lastProcessedYear = null;
    let currentYearAccumulator = { totalPoints: 0, totalCredits: 0 };

    const sortedSemesterKeys = Object.keys(currentStudentData.semesters).sort((a, b) => {
        const [yearA, semA] = a.split('-').map(Number);
        const [yearB, semB] = b.split('-').map(Number);
        if (yearA !== yearB) return yearA - yearB;
        return semA - semB;
    });

    for (const semesterKey of sortedSemesterKeys) {
        const originalSem = currentStudentData.semesters[semesterKey];
        const [academicYear, academicSemesterNum] = semesterKey.split('-').map(Number);

        let semesterAdjustedTotalPoints = 0;
        let semesterAdjustedTotalCredits = 0;
        const newCourseDetails = originalSem.courseDetails.map(course => {
            const expectedGradeKey = `${semesterKey}-${course.courseCode}`;
            const expectedGradeLetter = currentExpectedGrades[expectedGradeKey];

            let gradeToUse = course.originalGradeLetter; // Start with the original grade
            let gradePointToUse = getGradePoint(course.originalGradeLetter);

            // If an expected grade is provided and it's a valid grade, and it's an improvement
            if (expectedGradeLetter && getGradePoint(expectedGradeLetter) !== 0.00 && getGradePoint(expectedGradeLetter) > getGradePoint(gradeToUse)) {
                gradeToUse = expectedGradeLetter;
                gradePointToUse = getGradePoint(expectedGradeLetter);
            }

            semesterAdjustedTotalPoints += gradePointToUse * COURSE_CREDITS;
            semesterAdjustedTotalCredits += COURSE_CREDITS;

            return {
                ...course,
                gradeLetter: gradeToUse, // Update grade letter for display
                gradePoint: gradePointToUse // Update grade point for display
            };
        });

        const newSemesterGpa = semesterAdjustedTotalCredits > 0 ? parseFloat((semesterAdjustedTotalPoints / semesterAdjustedTotalCredits).toFixed(2)) : 0.00;

        // Accumulate for CGPA
        overallTotalPoints += semesterAdjustedTotalPoints;
        overallTotalCredits += semesterAdjustedTotalCredits;
        const newCurrentCgpa = overallTotalCredits > 0 ? parseFloat((overallTotalPoints / overallTotalCredits).toFixed(2)) : 0.00;

        // Accumulate for YGPA
        if (lastProcessedYear === null || lastProcessedYear !== academicYear) {
            currentYearAccumulator = { totalPoints: 0, totalCredits: 0 };
            lastProcessedYear = academicYear;
        }
        currentYearAccumulator.totalPoints += semesterAdjustedTotalPoints;
        currentYearAccumulator.totalCredits += semesterAdjustedTotalCredits;
        const newCurrentYgpa = currentYearAccumulator.totalCredits > 0 ? parseFloat((currentYearAccumulator.totalPoints / currentYearAccumulator.totalCredits).toFixed(2)) : 0.00;


        newSemesters[semesterKey] = {
            ...originalSem,
            gpa: newSemesterGpa,
            cgpa: newCurrentCgpa,
            ygpa: newCurrentYgpa,
            courseDetails: newCourseDetails,
            totalPoints: semesterAdjustedTotalPoints,
            totalCredits: semesterAdjustedTotalCredits,
        };
    }

    const newOverallCgpa = overallTotalCredits > 0 ? parseFloat((overallTotalPoints / overallTotalCredits).toFixed(2)) : 0.00;

    // Re-generate chart data based on new GPA/CGPA history
    const newStudentGpaHistory = sortedSemesterKeys.map(key => newSemesters[key].gpa);
    const newStudentCgpaHistory = sortedSemesterKeys.map(key => newSemesters[key].cgpa);
    // Note: YGPA is not directly used in the current chart, but can be added if needed.

    // Update only the 'Your GPA' and 'Your CGPA' datasets in the chart data
    const updatedGpaChartData = gpaChartData ? {
        ...gpaChartData,
        datasets: gpaChartData.datasets.map(dataset =>
            dataset.label === 'Your GPA' ? { ...dataset, data: newStudentGpaHistory } : dataset
        )
    } : null;

    const updatedCgpaChartData = cgpaChartData ? {
        ...cgpaChartData,
        datasets: cgpaChartData.datasets.map(dataset =>
            dataset.label === 'Your CGPA' ? { ...dataset, data: newStudentCgpaHistory } : dataset
        )
    } : null;

    setGpaChartData(updatedGpaChartData);
    setCgpaChartData(updatedCgpaChartData);


    return {
        ...currentStudentData,
        semesters: newSemesters,
        overallCgpa: newOverallCgpa,
    };
  }, [gpaChartData, cgpaChartData]); // Added gpaChartData and cgpaChartData as dependencies


  // New function to calculate overall ranks and chart averages for all students
  // This function now uses the cached batch data
  const calculateOverallRankAndChartAverages = useCallback(async () => {
    console.time("calculateOverallRankAndChartAverages"); // Start timer
    console.log("Starting overall rank and chart averages calculation...");

    if (!supabase || typeof supabase.from !== 'function') {
      console.error('Supabase client is not properly initialized. Check supabaseClient.js and Vercel environment variables.');
      setOverallStudentRank('Error');
      setBatchAverageCgpa('Error');
      return;
    }

    // Use cached data if available
    if (!allProcessedBatchData || requiredSemesterKeysGlobal.length === 0) {
        console.log("Batch data not yet loaded, waiting...");
        // This scenario should be handled by the useEffect that loads batch data
        // For now, we can return if data is not ready.
        setLoading(true); // Keep loading true until batch data is ready
        return;
    }

    const allStudentsFullProcessedData = allProcessedBatchData;
    // Removed allBatchCourseMetrics
    const requiredSemesterKeysArray = requiredSemesterKeysGlobal; // Use the globally stored keys

    const completeStudentsCgpas = []; // For ranking based on overall CGPA
    const allSemesterLabels = requiredSemesterKeysArray.sort((a, b) => { // Use the array version directly
        // Defensive check for 'a' and 'b' being strings before split
        if (typeof a !== 'string' || typeof b !== 'string') {
            console.error("Invalid semester key found during sorting:", a, b);
            return 0; // Or handle error appropriately
        }
        const [yearA, semA] = a.split('-').map(Number);
        const [yearB, semB] = b.split('-').map(Number);
        if (yearA !== yearB) return yearA - yearB;
        return semA - semB;
    }).map(key => {
        // Defensive check for 'key' being a string before split
        if (typeof key !== 'string') {
            console.error("Invalid key found in requiredSemesterKeysArray during label mapping:", key);
            return "Invalid Semester"; // Fallback label
        }
        const [year, sem] = key.split('-').map(Number);
        return `${year} Year ${sem === 1 ? '1st' : '2nd'} Semester`;
    });

    console.log("DEBUG: requiredSemesterKeysArray for chart processing:", requiredSemesterKeysArray);
    console.log("DEBUG: allSemesterLabels for chart processing:", allSemesterLabels);


    // Prepare data for per-semester averages
    const semesterWiseGpas = {}; // { '1-1': [], '1-2': [], ... }
    const semesterWiseCgpas = {}; // { '1-1': [], '1-2': [], ... }

    requiredSemesterKeysArray.forEach(key => { // Use the array version directly
        semesterWiseGpas[key] = [];
        semesterWiseCgpas[key] = [];
    });

    for (const studentRoll in allStudentsFullProcessedData) {
      const student = allStudentsFullProcessedData[studentRoll];
      if (student.isComplete) {
        completeStudentsCgpas.push({
          studentId: studentRoll,
          name: student.name,
          cgpa: student.overallCgpa,
        });

        // Populate semester-wise GPA/CGPA lists for averages
        Object.entries(student.semesters).forEach(([semKey, semDetails]) => {
          if (semDetails.gpa !== undefined) {
            semesterWiseGpas[semKey]?.push(semDetails.gpa);
          }
          if (semDetails.cgpa !== undefined) {
            semesterWiseCgpas[semKey]?.push(semDetails.cgpa);
          }
        });
      }
    }

    // Sort complete students by CGPA for ranking
    completeStudentsCgpas.sort((a, b) => b.cgpa - a.cgpa);

    // Assign ranks, handling ties
    let currentRank = 1;
    let prevCgpa = -1;
    for (let i = 0; i < completeStudentsCgpas.length; i++) {
      if (completeStudentsCgpas[i].cgpa < prevCgpa) {
        currentRank = i + 1;
      }
      completeStudentsCgpas[i].rank = currentRank;
      prevCgpa = completeStudentsCgpas[i].cgpa;
    }

    // Calculate rank for the current student
    const totalCompleteStudents = completeStudentsCgpas.length;
    const currentStudentRankData = completeStudentsCgpas.find(s => s.studentId === studentId);

    // Prepare student's own GPA and CGPA history for charts
    // This part will be updated by recalculateStudentResults to reflect expected grades
    let studentGpaHistory = [];
    let studentCgpaHistory = [];
    const currentStudentProcessedData = allStudentsFullProcessedData[studentId];

    if (currentStudentProcessedData && currentStudentProcessedData.gpaHistory && currentStudentProcessedData.cgpaHistory) {
        allSemesterLabels.forEach(label => {
            const semesterKey = requiredSemesterKeysArray.find(key => {
                if (typeof key !== 'string') {
                    console.warn("Invalid key found in requiredSemesterKeysArray during find:", key);
                    return false;
                }
                const [year, sem] = key.split('-').map(Number);
                return label === `${year} Year ${sem === 1 ? '1st' : '2nd'} Semester`;
            });
            if (semesterKey) {
                studentGpaHistory.push(currentStudentProcessedData.gpaHistory[semesterKey] || 0);
                studentCgpaHistory.push(currentStudentProcessedData.cgpaHistory[semesterKey] || 0);
            } else {
                studentGpaHistory.push(0);
                studentCgpaHistory.push(0);
            }
        });
    } else {
        console.warn(`Student data for ${studentId} is incomplete for chart history (missing gpaHistory/cgpaHistory).`);
    }

    if (currentStudentRankData) {
      let rankStart = currentStudentRankData.rank;
      let rankEnd = rankStart;
      for (let i = completeStudentsCgpas.indexOf(currentStudentRankData); i < completeStudentsCgpas.length; i++) {
          if (completeStudentsCgpas[i].cgpa === currentStudentRankData.cgpa) {
              rankEnd = completeStudentsCgpas[i].rank;
          } else {
              break;
          }
      }
      let rankDisplayString = (rankStart === rankEnd) ? `${rankStart} of ${totalCompleteStudents}` : `${rankStart}-${rankEnd} of ${totalCompleteStudents}`;
      setOverallStudentRank(rankDisplayString);

      // No longer augmenting studentData with course-level metrics here
      // studentData is updated by fetchAndProcessStudentData and recalculateStudentResults
    } else {
      setOverallStudentRank('N/A (Missing Semesters)');
      // setStudentData(prevData => ({ ...prevData, overallCgpa: 'N/A' })); // This might overwrite actual studentData
    }

    // Batch Average CGPA
    const totalCgpaSum = completeStudentsCgpas.reduce((sum, s) => sum + s.cgpa, 0);
    const averageCgpa = completeStudentsCgpas.length > 0 ? (totalCgpaSum / completeStudentsCgpas.length).toFixed(2) : 'N/A';
    setBatchAverageCgpa(averageCgpa);

    // Top students list
    setTopStudents(completeStudentsCgpas.slice(0, 5).map(s => ({
      id: s.studentId,
      name: s.name,
      cgpa: s.cgpa,
      rank: s.rank
    })));

    // Nearby students list
    const currentStudentIndex = completeStudentsCgpas.findIndex(s => s.studentId === studentId);
    if (currentStudentIndex !== -1) {
      const startIndex = Math.max(0, currentStudentIndex - 5);
      const endIndex = Math.min(completeStudentsCgpas.length, currentStudentIndex + 5 + 1);
      setNearbyStudents(completeStudentsCgpas.slice(startIndex, endIndex));
    } else {
      setNearbyStudents([]);
    }


    // Calculate semester-wise Top/Bottom/Batch Averages for charts
    const numTopBottomStudents = 5; // Number of students to consider for top/bottom average

    const avgGpaHistory = [];
    const topAvgGpaHistory = [];
    const bottomAvgGpaHistory = [];
    const avgCgpaHistory = [];
    const topAvgCgpaHistory = [];
    const bottomAvgCgpaHistory = [];

    allSemesterLabels.forEach(label => { // Use allSemesterLabels for iteration order
      const semesterKey = requiredSemesterKeysArray.find(key => {
        if (typeof key !== 'string') {
            console.warn("Invalid key found in requiredSemesterKeysArray during GPA/CGPA average calculation:", key);
            return false;
        }
        const [year, sem] = key.split('-').map(Number);
        return label === `${year} Year ${sem === 1 ? '1st' : '2nd'} Semester`;
      });

      // GPA Averages
      const gpasForSemester = semesterWiseGpas[semesterKey] || [];
      const sortedGpas = [...gpasForSemester].sort((a, b) => b - a);
      const avgGpa = sortedGpas.length > 0 ? (gpasForSemester.reduce((sum, g) => sum + g, 0) / gpasForSemester.length).toFixed(2) : 0;
      const topGpas = sortedGpas.slice(0, numTopBottomStudents);
      const bottomGpas = sortedGpas.slice(Math.max(0, sortedGpas.length - numTopBottomStudents));

      avgGpaHistory.push(parseFloat(avgGpa));
      topAvgGpaHistory.push(topGpas.length > 0 ? parseFloat((topGpas.reduce((sum, g) => sum + g, 0) / topGpas.length).toFixed(2)) : 0);
      bottomAvgGpaHistory.push(bottomGpas.length > 0 ? parseFloat((bottomGpas.reduce((sum, g) => sum + g, 0) / bottomGpas.length).toFixed(2)) : 0);

      // CGPA Averages
      const cgpasForSemester = semesterWiseCgpas[semesterKey] || [];
      const sortedCgpas = [...cgpasForSemester].sort((a, b) => b - a);
      const avgCgpa = sortedCgpas.length > 0 ? (cgpasForSemester.reduce((sum, c) => sum + c, 0) / cgpasForSemester.length).toFixed(2) : 0;
      const topCgpas = sortedCgpas.slice(0, numTopBottomStudents);
      const bottomCgpas = sortedCgpas.slice(Math.max(0, sortedCgpas.length - numTopBottomStudents));

      avgCgpaHistory.push(parseFloat(avgCgpa));
      topAvgCgpaHistory.push(topCgpas.length > 0 ? parseFloat((topCgpas.reduce((sum, c) => sum + c, 0) / topCgpas.length).toFixed(2)) : 0);
      bottomAvgCgpaHistory.push(bottomCgpas.length > 0 ? parseFloat((bottomCgpas.reduce((sum, c) => sum + c, 0) / bottomCgpas.length).toFixed(2)) : 0);
    });

    // Set GPA Chart Data (Your GPA data will be updated by recalculateStudentResults)
    setGpaChartData(prevData => ({
      labels: allSemesterLabels,
      datasets: [
        {
          label: 'Your GPA',
          data: studentGpaHistory, // Initial data, will be overwritten by recalculateStudentResults
          borderColor: 'rgba(0, 123, 255, 1)',
          backgroundColor: 'rgba(0, 123, 255, 0.2)',
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Top Avg. GPA',
          data: topAvgGpaHistory,
          borderColor: 'rgba(40, 167, 69, 1)',
          backgroundColor: 'rgba(40, 167, 69, 0.2)',
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Bottom Avg. GPA',
          data: bottomAvgGpaHistory,
          borderColor: 'rgba(255, 99, 132, 1)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Batch Avg. GPA', // For general batch average
          data: avgGpaHistory,
          borderColor: 'rgba(255, 193, 7, 1)',
          backgroundColor: 'rgba(255, 193, 7, 0.2)',
          fill: true,
          tension: 0.3,
        },
      ],
    }));

    // Set CGPA Chart Data (Your CGPA data will be updated by recalculateStudentResults)
    setCgpaChartData(prevData => ({
      labels: allSemesterLabels,
      datasets: [
        {
          label: 'Your CGPA',
          data: studentCgpaHistory, // Initial data, will be overwritten by recalculateStudentResults
          borderColor: 'rgba(0, 123, 255, 1)',
          backgroundColor: 'rgba(0, 123, 255, 0.2)',
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Top Avg. CGPA',
          data: topAvgCgpaHistory,
          borderColor: 'rgba(40, 167, 69, 1)',
          backgroundColor: 'rgba(40, 167, 69, 0.2)',
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Bottom Avg. CGPA',
          data: bottomAvgCgpaHistory,
          borderColor: 'rgba(255, 99, 132, 1)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Batch Avg. CGPA', // For general batch average
          data: avgCgpaHistory,
          borderColor: 'rgba(255, 193, 7, 1)',
          backgroundColor: 'rgba(255, 193, 7, 0.2)',
          fill: true,
          tension: 0.3,
        },
      ],
    }));

    console.log("Overall rank and chart averages calculation finished.");
    console.timeEnd("calculateOverallRankAndChartAverages"); // End timer
  }, [studentId, allProcessedBatchData, requiredSemesterKeysGlobal]);


  // Effect to trigger initial search on component mount with the default studentId
  useEffect(() => {
    // Only trigger if studentId is not empty (i.e., it's the default or a valid input)
    // and no search has been performed yet (studentData is null)
    if (studentId.trim().length === 10 && !studentData && !loading && !error) {
      fetchAndProcessStudentData();
    }
  }, [studentId, studentData, loading, error, fetchAndProcessStudentData]);

  // NEW useEffect: Load all batch data once on component mount
  useEffect(() => {
    const loadAllBatchData = async () => {
      // Only load if supabase is ready and data hasn't been loaded yet
      if (supabase && typeof supabase.from === 'function' && !allProcessedBatchData) {
        console.log("Initial load of all batch data for ranking and averages...");
        setLoading(true); // Indicate loading for initial batch data
        try {
          const allExistingTablesMetadata = await fetchExistingTableNames();
          // Removed allCourseMetrics from the destructuring as it's no longer returned/needed
          const { allStudentsFullProcessedData, requiredSemesterKeys } = await processAllStudentsSemesterData(allExistingTablesMetadata);
          setAllProcessedBatchData(allStudentsFullProcessedData);
          setRequiredSemesterKeysGlobal(requiredSemesterKeys);
        } catch (err) {
          console.error("Error loading all batch data:", err);
          setError("Failed to load batch data for analytics. Please try again.");
        } finally {
          setLoading(false); // End loading for initial batch data
        }
      }
    };
    loadAllBatchData();
  }, [supabase, allProcessedBatchData, processAllStudentsSemesterData]); // Dependencies ensure it runs once when supabase is available


  // Trigger overall rank and chart average calculation after studentData is loaded
  // AND after all batch data is loaded
  useEffect(() => {
    if (studentData && allProcessedBatchData && requiredSemesterKeysGlobal.length > 0) {
        calculateOverallRankAndChartAverages();
    }
  }, [studentData, allProcessedBatchData, requiredSemesterKeysGlobal, calculateOverallRankAndChartAverages]);

  // NEW useEffect: Recalculate student results when expectedGrades or base studentData changes
  useEffect(() => {
    if (studentData) {
      const updatedStudentData = recalculateStudentResults(studentData, expectedGrades);
      // Only update if there's a change to prevent infinite loops from state updates
      if (JSON.stringify(updatedStudentData) !== JSON.stringify(studentData)) {
          setStudentData(updatedStudentData);
      }
    }
  }, [expectedGrades, studentData, recalculateStudentResults]); // Dependencies

  const handleExpectedGradeChange = (semesterKey, courseCode, value) => {
    const newExpectedGrades = { ...expectedGrades };
    const key = `${semesterKey}-${courseCode}`;

    if (value.trim() === '') {
      delete newExpectedGrades[key]; // Remove if empty
    } else {
      newExpectedGrades[key] = value.toUpperCase(); // Store as uppercase
    }
    setExpectedGrades(newExpectedGrades);
  };


  const toggleSemesterExpansion = (semesterKey) => {
    setExpandedSemester(expandedSemester === semesterKey ? null : semesterKey);
  };

  return (
    <section className="container mx-auto p-4 pt-16 text-white">
      <h1 className="text-3xl font-bold mb-6 text-center">Student Result Analysis</h1>

      <div className="bg-gray-800 p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-2xl font-semibold mb-4">Search Student Results</h2>
        <div className="flex items-center space-x-4">
          <input
            type="text"
            placeholder="Enter a 10-digit Student ID (e.g., 2112135101)"
            className="p-3 border border-gray-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex-grow"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            maxLength={10}
          />
          <button
            onClick={fetchAndProcessStudentData}
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          >
            {loading ? 'Searching...' : 'Show Student Data'}
          </button>
        </div>
        {error && <p className="text-red-500 mt-4 text-center font-bold">{error}</p>}
        {loading && <p className="text-blue-400 mt-4 text-center">Loading student data...</p>}
      </div>

      {loading && !studentData ? ( // Show loading specific to initial batch data or individual search
        <div className="bg-gray-800 p-6 rounded-lg shadow-md text-center text-blue-400">
          <p>Loading data...</p>
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

          {/* GPA Trend Chart (Conditional Rendering) */}
          {gpaChartData && (
            <div className="mt-8 p-4 rounded-lg max-w-4xl mx-auto bg-white">
              <h3 className="text-xl font-semibold mb-4 text-center text-gray-800">GPA Trend (You vs. Batch Averages)</h3>
              <ResultTrendChart
                labels={gpaChartData.labels}
                datasets={gpaChartData.datasets}
                title="GPA Trend"
                yAxisLabel="GPA"
              />
            </div>
          )}

          {/* CGPA Trend Chart (Conditional Rendering) */}
          {cgpaChartData && (
            <div className="mt-8 p-4 rounded-lg max-w-4xl mx-auto bg-white">
              <h3 className="text-xl font-semibold mb-4 text-center text-gray-800">CGPA Trend (You vs. Batch Averages)</h3>
              <ResultTrendChart
                labels={cgpaChartData.labels}
                datasets={cgpaChartData.datasets}
                title="CGPA Trend"
                yAxisLabel="CGPA"
              />
            </div>
          )}

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
                        <td className="py-2 px-4 border-b border-gray-600">{student.studentId}</td>
                        <td className="py-2 px-4 border-b border-gray-600">{student.name}</td>
                        <td className="py-2 px-4 border-b border-gray-600">{student.cgpa}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
                            <div className="overflow-x-auto">
                              <table className="min-w-full bg-gray-700 rounded-lg text-left text-white text-sm">
                                <thead>
                                  <tr>
                                    <th className="py-2 px-3 border-b border-gray-600">Course Code</th>
                                    <th className="py-2 px-3 border-b border-gray-600">Current Grade</th>
                                    <th className="py-2 px-3 border-b border-gray-600">Expected Improvement Grade</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sem.courseDetails.map((course, idx) => (
                                    <tr key={idx} className="hover:bg-gray-600">
                                      <td className="py-2 px-3 border-b border-gray-600">{course.courseCode}</td>
                                      <td className="py-2 px-3 border-b border-gray-600">
                                        <span className="font-bold">{course.gradeLetter} ({course.gradePoint.toFixed(2)})</span>
                                      </td>
                                      <td className="py-2 px-3 border-b border-gray-600">
                                        {course.hasImprovementOpportunity ? (
                                          <input
                                            type="text"
                                            className="p-1 w-24 border border-gray-600 rounded-md bg-gray-800 text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            value={expectedGrades[`${semesterKey}-${course.courseCode}`] || ''}
                                            onChange={(e) => handleExpectedGradeChange(semesterKey, course.courseCode, e.target.value)}
                                            placeholder={course.originalGradeLetter}
                                            maxLength={2} // Max length for grades like A+, B-
                                          />
                                        ) : (
                                          <span className="text-gray-400">N/A</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
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
        !loading && !error && (
          <div className="bg-gray-800 p-6 rounded-lg shadow-md text-center text-gray-300">
            <p>Enter a Student ID and click "Show Student Data" to view results.</p>
          </div>
        )
      )}
    </section>
  );
}
