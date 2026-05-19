import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient'; // Ensure this path is correct
import ResultTrendChart from '../components/ResultTrendChart';
import {
  COURSE_CREDITS,
  fetchExistingTableNames,
  getSubjectCodesForAcademicSemester,
  getGradePoint,
  calculateStandardRankings, // <--- Add this
  getTopStudentsWithTies,    // <--- Add this
  getNearbyStudentsWithTies  // <--- Add this
} from '../lib/dataUtils';

// Log component render for debugging blank screen issues
console.log('ResultAnalysis component rendering...');

export default function ResultAnalysis() {
  const [studentId, setStudentId] = useState('2112135101'); // Default student ID for auto-search
  const [studentData, setStudentData] = useState(null); // Stores actual fetched data
  const [simulatedStudentData, setSimulatedStudentData] = useState(null); // Stores data with expected improvements
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
  const fetchAndProcessStudentData = useCallback(async () => {
    // Clear all relevant states at the beginning of a new search
    setError('');
    setLoading(true);
    setStudentData(null); // Explicitly set to null to ensure re-render of initial state if no data found
    setSimulatedStudentData(null); // Clear simulated data as well
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
    const allQueryPromises = [];
    
    const rollNoColumn = '"Roll no."';
    
    // --- MODIFICATION: Logic to fetch student name from a single reliable table ---
    let studentNameFound = `Student ${studentId}`; // Default name
    let nameSourceTable = null;
    let latestExamYearForName = -1;

    // Find the latest regular 1st year, 1st semester table as the most reliable source for a name
    allExistingTablesMetadata.forEach(meta => {
      if (meta.result_type === 'R' && meta.academic_year === 1 && meta.academic_semester === 1) {
        if (meta.exam_year > latestExamYearForName) {
          latestExamYearForName = meta.exam_year;
          nameSourceTable = meta.table_name;
        }
      }
    });

    if (nameSourceTable) {
        try {
            const { data, error } = await supabase.from(nameSourceTable)
              .select('Name')
              .eq(rollNoColumn, studentId)
              .single();

            if (data && data.Name) {
                studentNameFound = data.Name;
            } else if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found, which is ok.
                console.warn(`Could not fetch name from ${nameSourceTable}: ${error.message}`);
            }
        } catch (e) {
            console.error(`Error during name fetch from ${nameSourceTable}:`, e);
        }
    }
    // --- End of Name Fetching Logic ---


    allExistingTablesMetadata.forEach(meta => {
      const subjectCodesForSemester = getSubjectCodesForAcademicSemester(meta.academic_year, meta.academic_semester);
      // MODIFICATION: Conditionally select 'Name' only from the source table.
      // For all other tables, just select the roll number and subject codes.
      const selectColumns = [rollNoColumn, ...subjectCodesForSemester.map(code => `"${code}"`)];
      if (meta.table_name === nameSourceTable) {
          selectColumns.push('Name');
      }

      allQueryPromises.push({
          tableName: meta.table_name,
          academicYear: meta.academic_year,
          academicSemester: meta.academic_semester,
          examYear: meta.exam_year,
          type: meta.result_type,
          promise: supabase.from(meta.table_name).select(selectColumns.join(',')).eq(rollNoColumn, studentId)
      });
    });

    let results = [];

    try {
      const responses = await Promise.allSettled(allQueryPromises.map(q => q.promise));

      responses.forEach((response, index) => {
        const originalQueryInfo = allQueryPromises[index];
        if (response.status === 'fulfilled' && response.value.data && response.value.data.length > 0) {
          const recordData = response.value.data[0];
          results.push({
            tableName: originalQueryInfo.tableName,
            academicYear: originalQueryInfo.academicYear,
            academicSemester: originalQueryInfo.academicSemester,
            examYear: originalQueryInfo.examYear,
            type: originalQueryInfo.type,
            data: recordData
          });
        } else if (response.status === 'rejected') {
            console.error(`Query failed for table ${originalQueryInfo.tableName}:`, response.reason.message);
        }
      });

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
          gpa: 0.00,
          ygpa: 0.00
        };
      }

      if (type === 'R') {
        if (examYear > processedRawStudentRecords[semesterKey].examYear) {
          processedRawStudentRecords[semesterKey] = {
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
              processedRawStudentRecords[semesterKey].grades[code] = data[code];
              processedRawStudentRecords[semesterKey].originalGrades[code] = data[code];
            }
          });
        }
      } else if (type === 'I') {
        const improvementRecord = data;
        const subjectCodes = getSubjectCodesForAcademicSemester(academicYear, academicSemester);

        subjectCodes.forEach(code => {
          const improvedGrade = improvementRecord[code];
          
          const isRealGrade = improvedGrade && typeof improvedGrade === 'string' && getGradePoint(improvedGrade) >= 0;

          if (isRealGrade) {
            const currentGrade = processedRawStudentRecords[semesterKey]?.grades[code];
            const currentGradePoint = getGradePoint(currentGrade);
            const improvedGradePoint = getGradePoint(improvedGrade);

            const isEligibleForImprovement = currentGradePoint < getGradePoint('B-') || currentGrade === 'F';

            if (isEligibleForImprovement && improvedGradePoint > currentGradePoint) {
              processedRawStudentRecords[semesterKey].grades[code] = improvedGrade;
            } else if (currentGrade === undefined && improvedGradePoint >= 0) {
               processedRawStudentRecords[semesterKey].grades[code] = improvedGrade;
               processedRawStudentRecords[semesterKey].originalGrades[code] = improvedGrade;
            }
          }
        });
      }
    });

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
      const subjectCodes = getSubjectCodesForAcademicSemester(academicYear, academicSemesterNum);

      let semesterTotalPoints = 0;
      let semesterTotalCredits = 0;
      const courseDetails = [];

      subjectCodes.forEach(code => {
        const gradeLetter = gradesMap[code];
        const originalGradeLetter = originalGradesMap[code] || gradeLetter;
        const gradePoint = getGradePoint(gradeLetter);
        const credit = COURSE_CREDITS;

        semesterTotalPoints += gradePoint * credit;
        semesterTotalCredits += credit;

        courseDetails.push({
          courseCode: code,
          gradeLetter,
          gradePoint,
          originalGradeLetter: originalGradeLetter,
          hasImprovementOpportunity: getGradePoint(originalGradeLetter) < getGradePoint('B-') || originalGradeLetter === 'F',
          improvementApplied: !!(originalGradesMap[code] && gradesMap[code] !== originalGradesMap[code])
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

    const newStudentData = {
      id: studentId,
      name: studentNameFound,
      semesters: finalProcessedSemesters,
      overallCgpa: currentCgpaAccumulator.totalCredits > 0 ? parseFloat((currentCgpaAccumulator.totalPoints / currentCgpaAccumulator.totalCredits).toFixed(2)) : 0.00,
      gpaHistory: studentGpaHistory,
      cgpaHistory: studentCgpaHistory,
    };

    setStudentData(newStudentData);
    setSimulatedStudentData(newStudentData);

    setLoading(false);
  }, [studentId, calculateGpa, calculateCgpaFromSemesters, calculateYgpaFromYears]);

  // Helper function to process all students' raw data into structured semester data
  const processAllStudentsSemesterData = useCallback(async (allExistingTablesMetadata) => {
    console.time("processAllStudentsSemesterData");

    let allStudentsRawData = {};
    const allStudentQueryPromises = [];
    
    const rollNoColumn = '"Roll no."';
    
    let nameSourceTable = null;
    let latestExamYearForName = -1;
    allExistingTablesMetadata.forEach(meta => {
      if (meta.result_type === 'R' && meta.academic_year === 1 && meta.academic_semester === 1) {
        if (meta.exam_year > latestExamYearForName) {
          latestExamYearForName = meta.exam_year;
          nameSourceTable = meta.table_name;
        }
      }
    });

    allExistingTablesMetadata.forEach(meta => {
      const subjectCodesForTable = getSubjectCodesForAcademicSemester(meta.academic_year, meta.academic_semester);
      const selectColumnsForTable = [rollNoColumn, ...subjectCodesForTable.map(code => `"${code}"`)];
      if (meta.table_name === nameSourceTable) {
        selectColumnsForTable.push('Name');
      }

      allStudentQueryPromises.push({
          tableName: meta.table_name,
          academicYear: meta.academic_year,
          academicSemester: meta.academic_semester,
          examYear: meta.exam_year,
          type: meta.result_type,
          isNameSource: meta.table_name === nameSourceTable,
          promise: supabase.from(meta.table_name).select(selectColumnsForTable.join(','))
      });
    });

    const responses = await Promise.allSettled(allStudentQueryPromises.map(q => q.promise));
    
    responses.forEach((response, index) => {
        const originalQueryInfo = allStudentQueryPromises[index];
        if (response.status === 'fulfilled' && response.value.data && response.value.data.length > 0) {
            response.value.data.forEach(studentRecord => {
                const studentRoll = studentRecord['Roll no.'];
                if (!studentRoll) return;

                if (!allStudentsRawData[studentRoll]) {
                    allStudentsRawData[studentRoll] = {
                        name: `Student ${studentRoll}`,
                        records: []
                    };
                }
                
                if (originalQueryInfo.isNameSource && studentRecord.Name) {
                    allStudentsRawData[studentRoll].name = studentRecord.Name;
                }

                allStudentsRawData[studentRoll].records.push({
                    tableName: originalQueryInfo.tableName,
                    academicYear: originalQueryInfo.academicYear,
                    academicSemester: originalQueryInfo.academicSemester,
                    examYear: originalQueryInfo.examYear,
                    type: originalQueryInfo.type,
                    data: studentRecord
                });
            });
        }
    });

    const allStudentsFullProcessedData = {};
    for (const studentRoll in allStudentsRawData) {
      const student = allStudentsRawData[studentRoll];
      const processedSemestersForThisStudent = {};
      
      // MODIFICATION: Determine batch based on the EARLIEST regular exam year.
      const firstRegularRecord = student.records
        .filter(r => r.type === 'R' && r.academic_year === 1 && r.academic_semester === 1)
        .sort((a, b) => a.examYear - b.examYear)[0];

      if (!firstRegularRecord) {
        continue; // Skip students with no 1-1 regular result, as we can't determine their batch.
      }
      
      const sessionStartYear = firstRegularRecord.examYear;
      const studentBatchKey = `batch-${sessionStartYear + 3}`; // Batch is defined by graduation year

      // Determine the latest semester for this specific batch
      const tablesForThisBatch = allExistingTablesMetadata.filter(meta => {
          const tableBatchYear = meta.exam_year - meta.academic_year + 4;
          return tableBatchYear === (sessionStartYear + 3);
      });

      let maxYearForBatch = 0;
      let maxSemForBatch = 0;
      tablesForThisBatch.forEach(meta => {
          if(meta.academic_year > maxYearForBatch) {
              maxYearForBatch = meta.academic_year;
              maxSemForBatch = meta.academic_semester;
          } else if (meta.academic_year === maxYearForBatch && meta.academic_semester > maxSemForBatch) {
              maxSemForBatch = meta.academic_semester;
          }
      });

      const requiredKeysForThisBatch = new Set();
      for (let y = 1; y <= maxYearForBatch; y++) {
          for (let s = 1; s <=2; s++) {
              if (y < maxYearForBatch || (y === maxYearForBatch && s <= maxSemForBatch)) {
                  requiredKeysForThisBatch.add(`${y}-${s}`);
              }
          }
      }

      const sortedRecords = student.records.sort((a, b) => {
        if (a.academicYear !== b.academicYear) return a.academicYear - b.academicYear;
        return a.academicSemester - b.academicSemester;
      });

      sortedRecords.forEach(record => {
        const { academicYear, academicSemester, examYear, type, data } = record;
        const semesterKey = `${academicYear}-${academicSemester}`;

        if (!processedSemestersForThisStudent[semesterKey]) {
          processedSemestersForThisStudent[semesterKey] = {
            examYear: -1, type: '', grades: {}, totalPoints: 0, totalCredits: 0,
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
            const isRealGrade = improvedGrade && typeof improvedGrade === 'string' && getGradePoint(improvedGrade) >= 0;

            if (isRealGrade) {
              const currentGrade = processedSemestersForThisStudent[semesterKey].grades[code];
              const currentGradePoint = getGradePoint(currentGrade);
              const improvedGradePoint = getGradePoint(improvedGrade);
              const isEligibleForImprovement = currentGradePoint < getGradePoint('B-') || currentGrade === 'F';

              if (isEligibleForImprovement && improvedGradePoint > currentGradePoint) {
                processedSemestersForThisStudent[semesterKey].grades[code] = improvedGrade;
              } else if (currentGrade === undefined && improvedGradePoint >= 0) {
                 processedSemestersForThisStudent[semesterKey].grades[code] = improvedGrade;
              }
            }
          });
        }
      });

      const chronologicalSemesterKeysForStudent = Object.keys(processedSemestersForThisStudent).sort((a, b) => {
        const [yearA, semA] = a.split('-').map(Number);
        const [yearB, semB] = b.split('-').map(Number);
        if (yearA !== yearB) return yearA - yearB;
        return semA - semB;
      });
      
      let currentCgpaAccumulator = { totalPoints: 0, totalCredits: 0 };
      let currentYearAccumulator = { totalPoints: 0, totalCredits: 0 };
      let lastProcessedYear = null;
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

      const studentOverallCgpa = currentCgpaAccumulator.totalCredits > 0 ? parseFloat((currentCgpaAccumulator.totalPoints / currentCgpaAccumulator.totalCredits).toFixed(2)) : 0.00;

      const studentSemesterKeys = new Set(Object.keys(processedSemestersForThisStudent));
      const hasAllRequiredSemesters = Array.from(requiredKeysForThisBatch).every(key => studentSemesterKeys.has(key));

      allStudentsFullProcessedData[studentRoll] = {
        id: studentRoll,
        name: student.name,
        overallCgpa: studentOverallCgpa,
        semesters: processedSemestersForThisStudent,
        isComplete: hasAllRequiredSemesters,
        gpaHistory: studentSemesterGpas,
        cgpaHistory: studentSemesterCgpas,
        batchKey: studentBatchKey,
        requiredSemesterKeys: Array.from(requiredKeysForThisBatch)
      };
    }

    console.timeEnd("processAllStudentsSemesterData");
    return { allStudentsFullProcessedData };
  }, [calculateGpa, calculateCgpaFromSemesters]);


  // New function to recalculate student's results based on expected grades
  const recalculateStudentResults = useCallback((baseStudentData, currentExpectedGrades) => {
    if (!baseStudentData || !baseStudentData.semesters) return null;

    const newSemesters = {};
    let overallTotalPoints = 0;
    let overallTotalCredits = 0;
    let lastProcessedYear = null;
    let currentYearAccumulator = { totalPoints: 0, totalCredits: 0 };

    const sortedSemesterKeys = Object.keys(baseStudentData.semesters).sort((a, b) => {
        const [yearA, semA] = a.split('-').map(Number);
        const [yearB, semB] = b.split('-').map(Number);
        if (yearA !== yearB) return yearA - yearB;
        return semA - semB;
    });

    for (const semesterKey of sortedSemesterKeys) {
        const originalSem = baseStudentData.semesters[semesterKey];
        if (!originalSem) {
            console.warn(`Semester data for ${semesterKey} is undefined in baseStudentData. Skipping.`);
            continue;
        }
        const [academicYear, academicSemesterNum] = semesterKey.split('-').map(Number);

        let semesterAdjustedTotalPoints = 0;
        let semesterAdjustedTotalCredits = 0;
        const newCourseDetails = originalSem.courseDetails.map(course => {
            const expectedGradeKey = `${semesterKey}-${course.courseCode}`;
            const expectedGradeLetter = currentExpectedGrades[expectedGradeKey];

            let gradeToUse = course.originalGradeLetter;
            let gradePointToUse = getGradePoint(course.originalGradeLetter);

            if (expectedGradeLetter && getGradePoint(expectedGradeLetter) !== 0.00 && getGradePoint(expectedGradeLetter) > getGradePoint(gradeToUse)) {
                gradeToUse = expectedGradeLetter;
                gradePointToUse = getGradePoint(expectedGradeLetter);
            }

            semesterAdjustedTotalPoints += gradePointToUse * COURSE_CREDITS;
            semesterAdjustedTotalCredits += COURSE_CREDITS;

            return {
                ...course,
                gradeLetter: gradeToUse,
                gradePoint: gradePointToUse
            };
        });

        const newSemesterGpa = semesterAdjustedTotalCredits > 0 ? parseFloat((semesterAdjustedTotalPoints / semesterAdjustedTotalCredits).toFixed(2)) : 0.00;

        overallTotalPoints += semesterAdjustedTotalPoints;
        overallTotalCredits += semesterAdjustedTotalCredits;
        const newCurrentCgpa = overallTotalCredits > 0 ? parseFloat((overallTotalPoints / overallTotalCredits).toFixed(2)) : 0.00;

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

    return {
        ...baseStudentData,
        semesters: newSemesters,
        overallCgpa: newOverallCgpa,
        gpaHistory: sortedSemesterKeys.map(key => newSemesters[key]?.gpa || 0),
        cgpaHistory: sortedSemesterKeys.map(key => newSemesters[key]?.cgpa || 0),
    };
  }, [calculateCgpaFromSemesters, calculateYgpaFromYears]);


  // New function to calculate overall ranks and chart averages for all students
  const calculateOverallRankAndChartAverages = useCallback(async () => {
    console.time("calculateOverallRankAndChartAverages");

    if (!allProcessedBatchData || !studentData) {
        console.log("Batch data or current student data not yet loaded, waiting...");
        return;
    }

    const currentStudentProcessedData = allProcessedBatchData[studentId];
    if (!currentStudentProcessedData) {
        setOverallStudentRank('N/A (Not in batch)');
        setBatchAverageCgpa('N/A');
        return;
    }

    const currentStudentBatchKey = currentStudentProcessedData.batchKey;
    const studentsInSameBatch = Object.values(allProcessedBatchData).filter(s => s.batchKey === currentStudentBatchKey);
    const completeStudentsForRanking = studentsInSameBatch.filter(s => s.isComplete);

    const requiredSemesterKeysForBatch = currentStudentProcessedData.requiredSemesterKeys;

    const allSemesterLabels = requiredSemesterKeysForBatch.sort((a, b) => {
        const [yearA, semA] = a.split('-').map(Number);
        const [yearB, semB] = b.split('-').map(Number);
        if (yearA !== yearB) return yearA - yearB;
        return semA - semB;
    }).map(key => {
        const [year, sem] = key.split('-').map(Number);
        return `${year} Year ${sem === 1 ? '1st' : '2nd'} Semester`;
    });

    const semesterWiseGpas = {};
    const semesterWiseCgpas = {};

    requiredSemesterKeysForBatch.forEach(key => {
        semesterWiseGpas[key] = [];
        semesterWiseCgpas[key] = [];
    });
    
    // Populate chart data from ALL students in the same batch, regardless of completion
    studentsInSameBatch.forEach(student => {
        Object.entries(student.semesters).forEach(([semKey, semDetails]) => {
            if (semesterWiseGpas[semKey] && semDetails.gpa !== undefined) {
                semesterWiseGpas[semKey].push(semDetails.gpa);
            }
            if (semesterWiseCgpas[semKey] && semDetails.cgpa !== undefined) {
                semesterWiseCgpas[semKey].push(semDetails.cgpa);
            }
        });
    });

    try {
      // 1. Process the entire cohort through the Standard Competition math engine
      const rankedCohort = calculateStandardRankings(completeStudentsForRanking, 'overallCgpa');
      const totalCompleteStudents = rankedCohort.length;

      // 2. Find the current student's overall rank
      const currentStudentRankData = rankedCohort.find(s => String(s.id) === String(studentId));
      if (currentStudentRankData) {
        setOverallStudentRank(`${currentStudentRankData.rank} of ${totalCompleteStudents}`);
      } else {
        setOverallStudentRank('N/A (Incomplete Data)');
      }

      // 3. Batch Average CGPA calculation
      const totalCgpaSum = rankedCohort.reduce((sum, s) => sum + (s.overallCgpa || 0), 0);
      const averageCgpa = totalCompleteStudents > 0 ? (totalCgpaSum / totalCompleteStudents).toFixed(2) : 'N/A';
      setBatchAverageCgpa(averageCgpa);

      // 4. Extract Top Students
      const rawTopStudents = getTopStudentsWithTies(rankedCohort, 5) || [];
      setTopStudents(rawTopStudents.map(s => ({
        id: s.id,
        studentId: s.studentId || s.id,
        name: s.name || 'Unknown',
        cgpa: s.overallCgpa,
        rank: s.rank
      })));

      // 5. Extract Nearby Students
      const rawNearbyStudents = getNearbyStudentsWithTies(rankedCohort, studentId, 5) || [];
      setNearbyStudents(rawNearbyStudents.map(s => ({
        id: s.id,
        studentId: s.studentId || s.id,
        name: s.name || 'Unknown',
        cgpa: s.overallCgpa,
        rank: s.rank
      })));

    } catch (error) {
      console.error("Ranking Engine Error:", error);
      setOverallStudentRank("Error calculating rank");
    }

    const numTopBottomStudents = 5;
    const avgGpaHistory = [];
    const topAvgGpaHistory = [];
    const bottomAvgGpaHistory = [];
    const avgCgpaHistory = [];
    const topAvgCgpaHistory = [];
    const bottomAvgCgpaHistory = [];

    allSemesterLabels.forEach(label => {
      const semesterKey = requiredSemesterKeysForBatch.find(key => {
        const [year, sem] = key.split('-').map(Number);
        return label === `${year} Year ${sem === 1 ? '1st' : '2nd'} Semester`;
      });

      const gpasForSemester = semesterWiseGpas[semesterKey] || [];
      const sortedGpas = [...gpasForSemester].sort((a, b) => b - a);
      const avgGpa = sortedGpas.length > 0 ? (gpasForSemester.reduce((sum, g) => sum + g, 0) / gpasForSemester.length).toFixed(2) : 0;
      const topGpas = sortedGpas.slice(0, numTopBottomStudents);
      const bottomGpas = sortedGpas.slice(Math.max(0, sortedGpas.length - numTopBottomStudents));

      avgGpaHistory.push(parseFloat(avgGpa));
      topAvgGpaHistory.push(topGpas.length > 0 ? parseFloat((topGpas.reduce((sum, g) => sum + g, 0) / topGpas.length).toFixed(2)) : 0);
      bottomAvgGpaHistory.push(bottomGpas.length > 0 ? parseFloat((bottomGpas.reduce((sum, g) => sum + g, 0) / bottomGpas.length).toFixed(2)) : 0);

      const cgpasForSemester = semesterWiseCgpas[semesterKey] || [];
      const sortedCgpas = [...cgpasForSemester].sort((a, b) => b - a);
      const avgCgpa = sortedCgpas.length > 0 ? (cgpasForSemester.reduce((sum, c) => sum + c, 0) / cgpasForSemester.length).toFixed(2) : 0;
      const topCgpas = sortedCgpas.slice(0, numTopBottomStudents);
      const bottomCgpas = sortedCgpas.slice(Math.max(0, sortedCgpas.length - numTopBottomStudents));

      avgCgpaHistory.push(parseFloat(avgCgpa));
      topAvgCgpaHistory.push(topCgpas.length > 0 ? parseFloat((topCgpas.reduce((sum, c) => sum + c, 0) / topCgpas.length).toFixed(2)) : 0);
      bottomAvgCgpaHistory.push(bottomCgpas.length > 0 ? parseFloat((bottomCgpas.reduce((sum, c) => sum + c, 0) / bottomCgpas.length).toFixed(2)) : 0);
    });

    setGpaChartData({
      labels: allSemesterLabels,
      datasets: [
        { label: 'Your GPA', data: [], borderColor: 'rgba(0, 123, 255, 1)', backgroundColor: 'rgba(0, 123, 255, 0.2)', fill: true, tension: 0.3, },
        { label: 'Top Avg. GPA', data: topAvgGpaHistory, borderColor: 'rgba(40, 167, 69, 1)', backgroundColor: 'rgba(40, 167, 69, 0.2)', fill: true, tension: 0.3, },
        { label: 'Bottom Avg. GPA', data: bottomAvgGpaHistory, borderColor: 'rgba(255, 99, 132, 1)', backgroundColor: 'rgba(255, 99, 132, 0.2)', fill: true, tension: 0.3, },
        { label: 'Batch Avg. GPA', data: avgGpaHistory, borderColor: 'rgba(255, 193, 7, 1)', backgroundColor: 'rgba(255, 193, 7, 0.2)', fill: true, tension: 0.3, },
      ],
    });

    setCgpaChartData({
      labels: allSemesterLabels,
      datasets: [
        { label: 'Your CGPA', data: [], borderColor: 'rgba(0, 123, 255, 1)', backgroundColor: 'rgba(0, 123, 255, 0.2)', fill: true, tension: 0.3, },
        { label: 'Top Avg. CGPA', data: topAvgCgpaHistory, borderColor: 'rgba(40, 167, 69, 1)', backgroundColor: 'rgba(40, 167, 69, 0.2)', fill: true, tension: 0.3, },
        { label: 'Bottom Avg. CGPA', data: bottomAvgCgpaHistory, borderColor: 'rgba(255, 99, 132, 1)', backgroundColor: 'rgba(255, 99, 132, 0.2)', fill: true, tension: 0.3, },
        { label: 'Batch Avg. CGPA', data: avgCgpaHistory, borderColor: 'rgba(255, 193, 7, 1)', backgroundColor: 'rgba(255, 193, 7, 0.2)', fill: true, tension: 0.3, },
      ],
    });

    console.timeEnd("calculateOverallRankAndChartAverages");
  }, [studentId, allProcessedBatchData, studentData]);


  // Effect to trigger initial search on component mount with the default studentId
  useEffect(() => {
    if (studentId.trim().length === 10 && !studentData && !loading && !error) {
      fetchAndProcessStudentData();
    }
  }, [studentId, studentData, loading, error, fetchAndProcessStudentData]);

  // NEW useEffect: Load all batch data once on component mount
  useEffect(() => {
    const loadAllBatchData = async () => {
      if (supabase && typeof supabase.from !== 'function' && !allProcessedBatchData) {
        console.log("Initial load of all batch data for ranking and averages...");
        setLoading(true); // Indicate loading for initial batch data
        try {
          const allExistingTablesMetadata = await fetchExistingTableNames();
          const { allStudentsFullProcessedData } = await processAllStudentsSemesterData(allExistingTablesMetadata);
          setAllProcessedBatchData(allStudentsFullProcessedData);
        } catch (err) {
          console.error("Error loading all batch data:", err);
          setError("Failed to load batch data for analytics. Please try again.");
        } finally {
          setLoading(false); // End loading for initial batch data
        }
      }
    };
    loadAllBatchData();
  }, [supabase, allProcessedBatchData, processAllStudentsSemesterData]);

  // Trigger overall rank and chart average calculation after studentData is loaded
  // AND after all batch data is loaded
  useEffect(() => {
    if (studentData && allProcessedBatchData) {
        calculateOverallRankAndChartAverages();
    }
  }, [studentData, allProcessedBatchData, calculateOverallRankAndChartAverages]);

  // NEW useEffect: Recalculate student results when expectedGrades or base studentData changes
  // This now updates simulatedStudentData, not studentData
  useEffect(() => {
    if (studentData) { // Use studentData as the base for simulation
      const updatedSimulatedData = recalculateStudentResults(studentData, expectedGrades);
      // Only update if the content of simulatedStudentData actually changes to prevent infinite loops
      if (JSON.stringify(updatedSimulatedData) !== JSON.stringify(simulatedStudentData)) {
          setSimulatedStudentData(updatedSimulatedData);
      }
    }
  }, [expectedGrades, studentData, recalculateStudentResults, simulatedStudentData]); // Added simulatedStudentData as dependency for comparison

  // NEW useEffect: Update chart data when simulatedStudentData or requiredSemesterKeysGlobal changes
  useEffect(() => {
    if (simulatedStudentData && allProcessedBatchData) {
        const currentStudentProcessedData = allProcessedBatchData[simulatedStudentData.id];
        if (!currentStudentProcessedData) return;

        const requiredSemesterKeysForBatch = currentStudentProcessedData.requiredSemesterKeys;

        const allSemesterLabels = requiredSemesterKeysForBatch.sort((a, b) => {
            const [yearA, semA] = a.split('-').map(Number);
            const [yearB, semB] = b.split('-').map(Number);
            if (yearA !== yearB) return yearA - yearB;
            return semA - semB;
        }).map(key => {
            const [year, sem] = key.split('-').map(Number);
            return `${year} Year ${sem === 1 ? '1st' : '2nd'} Semester`;
        });

        const newStudentGpaHistory = allSemesterLabels.map(label => {
            const semesterKey = requiredSemesterKeysForBatch.find(key => {
                const [year, sem] = key.split('-').map(Number);
                return label === `${year} Year ${sem === 1 ? '1st' : '2nd'} Semester`;
            });
            return simulatedStudentData.semesters[semesterKey]?.gpa || 0;
        });
        const newStudentCgpaHistory = allSemesterLabels.map(label => {
            const semesterKey = requiredSemesterKeysForBatch.find(key => {
                const [year, sem] = key.split('-').map(Number);
                return label === `${year} Year ${sem === 1 ? '1st' : '2nd'} Semester`;
            });
            return simulatedStudentData.semesters[semesterKey]?.cgpa || 0;
        });

        // Update GpaChartData
        setGpaChartData(prevData => {
            if (!prevData) return null;
            return {
                ...prevData,
                labels: allSemesterLabels, // Update labels as well
                datasets: prevData.datasets.map(dataset =>
                    dataset.label === 'Your GPA' ? { ...dataset, data: newStudentGpaHistory } : dataset
                )
            };
        });

        // Update CgpaChartData
        setCgpaChartData(prevData => {
            if (!prevData) return null;
            return {
                ...prevData,
                labels: allSemesterLabels, // Update labels as well
                datasets: prevData.datasets.map(dataset =>
                    dataset.label === 'Your CGPA' ? { ...dataset, data: newStudentCgpaHistory } : dataset
                )
            };
        });
    }
  }, [simulatedStudentData, allProcessedBatchData]);


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

      {loading && !simulatedStudentData ? ( // Use simulatedStudentData for loading check
        <div className="bg-gray-800 p-6 rounded-lg shadow-md text-center text-blue-400">
          <p>Loading data...</p>
        </div>
      ) : error ? (
        <div className="bg-gray-800 p-6 rounded-lg shadow-md text-center text-red-500">
          <p>{error}</p>
        </div>
      ) : simulatedStudentData ? ( // Render based on simulatedStudentData
        <div className="bg-gray-800 p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold mb-4 text-center">Results for Student ID: {simulatedStudentData.id} ({simulatedStudentData.name})</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-gray-700 p-4 rounded-md text-center">
              <p className="text-lg font-medium">Overall CGPA:</p>
              <p className="text-4xl font-bold text-green-400">{simulatedStudentData.overallCgpa}</p>
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
                  <th className="py-3 px-4 border-b border-gray-600">YGPA</th>
                  <th className="py-3 px-4 border-b border-gray-600">CGPA</th>
                  <th className="py-3 px-4 border-b border-gray-600">Details</th>
                </tr>
              </thead>
              <tbody>
                {simulatedStudentData.semesters && Object.entries(simulatedStudentData.semesters).map(([semesterKey, sem]) => (
                  <React.Fragment key={semesterKey}>
                    <tr
                      className="hover:bg-gray-600 cursor-pointer"
                      onClick={() => toggleSemesterExpansion(semesterKey)}
                    >
                      <td className="py-2 px-4 border-b border-gray-600">{sem.semesterDisplayName}</td>
                      <td className="py-2 px-4 border-b border-gray-600">{sem.gpa}</td>
                      <td className="py-2 px-4 border-b border-gray-600">{sem.ygpa}</td>
                      <td className="py-2 px-4 border-b border-gray-600">{sem.cgpa}</td>
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
                                    {/* MODIFICATION: Renamed table headers */}
                                    <th className="py-2 px-3 border-b border-gray-600">Regular Grade</th>
                                    <th className="py-2 px-3 border-b border-gray-600">Expected or Improvement Grade</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sem.courseDetails.map((course, idx) => (
                                    <tr key={idx} className="hover:bg-gray-600">
                                      <td className="py-2 px-3 border-b border-gray-600">{course.courseCode}</td>
                                      {/* MODIFICATION: Show original grade in the "Regular Grade" column */}
                                      <td className="py-2 px-3 border-b border-gray-600">
                                        <span className="font-bold">{course.originalGradeLetter} ({getGradePoint(course.originalGradeLetter).toFixed(2)})</span>
                                      </td>
                                      <td className="py-2 px-3 border-b border-gray-600">
                                        {/* MODIFICATION: New logic to show existing improvement or an input box */}
                                        {course.improvementApplied ? (
                                          <span className="font-bold text-green-400">{course.gradeLetter} ({course.gradePoint.toFixed(2)})</span>
                                        ) : course.hasImprovementOpportunity ? (
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
