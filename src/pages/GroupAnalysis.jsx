import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient'; // Ensure this path is correct
import ResultTrendChart from '../components/ResultTrendChart'; // Reusing the chart component
import { Link } from 'react-router-dom';
import {
  COURSE_CREDITS,
  COURSES_PER_SEMESTER,
  fetchExistingTableNames,
  getSubjectCodesForAcademicSemester,
  getGradePoint
} from '../lib/dataUtils';

// Helper function to calculate GPA for a set of grades (copied from ResultAnalysis for self-containment)
const calculateGpa = (grades) => {
  let totalPoints = 0;
  let totalCredits = 0;
  Object.values(grades).forEach((gradeLetter) => {
    const gradePoint = getGradePoint(gradeLetter);
    const credit = COURSE_CREDITS;
    totalPoints += gradePoint * credit;
    totalCredits += credit;
  });
  return totalCredits > 0 ? parseFloat((totalPoints / totalCredits).toFixed(3)) : 0.000;
};

// Helper to calculate CGPA from processed semester data (copied from ResultAnalysis for self-containment)
const calculateCgpaFromSemesters = (semesters) => {
  let overallTotalPoints = 0;
  let overallTotalCredits = 0;
  Object.values(semesters).forEach(sem => {
    overallTotalPoints += sem.totalPoints;
    overallTotalCredits += sem.totalCredits;
  });
  return overallTotalCredits > 0 ? parseFloat((overallTotalPoints / overallTotalCredits).toFixed(3)) : 0.000;
};

// Helper to calculate YGPA from processed year data (copied from ResultAnalysis for self-containment)
const calculateYgpaFromYears = (years) => {
  let overallTotalPoints = 0;
  let overallTotalCredits = 0;
  Object.values(years).forEach(year => {
    overallTotalPoints += year.totalPoints;
    overallTotalCredits += year.totalCredits;
  });
  return overallTotalCredits > 0 ? parseFloat((overallTotalPoints / overallTotalCredits).toFixed(3)) : 0.000;
};

// Core data fetching and processing logic for a single student (extracted for reuse)
const fetchAndProcessSingleStudentData = async (studentIdToFetch) => {
  if (!studentIdToFetch || studentIdToFetch.trim().length !== 10) {
    return { error: 'Invalid Student ID provided for fetching.' };
  }

  if (!supabase || typeof supabase.from !== 'function') {
    console.error('Supabase client is not properly initialized. Check supabaseClient.js and Vercel environment variables.');
    return { error: 'Application error: Supabase connection failed.' };
  }

  const allExistingTablesMetadata = await fetchExistingTableNames();
  const allQueryPromises = [];
  const rollNoColumnName = 'Roll no.';

  let studentNameFound = `Student ${studentIdToFetch}`;
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

  if (latestRegularFirstSemesterTable) {
    try {
      const { data, error } = await supabase.from(latestRegularFirstSemesterTable)
        .select('Name')
        .eq(`"${rollNoColumnName}"`, studentIdToFetch)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.warn(`Error fetching name from ${latestRegularFirstSemesterTable}:`, error.message);
      }

      if (data && data.Name) {
        studentNameFound = data.Name;
      }
    } catch (err) {
      console.warn(`Unexpected error fetching name from ${latestRegularFirstSemesterTable}:`, err);
    }
  }

  allExistingTablesMetadata.forEach(meta => {
    const subjectCodesForSemester = getSubjectCodesForAcademicSemester(meta.academic_year, meta.academic_semester);
    const filteredSubjectCodes = subjectCodesForSemester.filter(code => typeof code === 'string' && code.length > 0);

    let selectColumns = [`"${rollNoColumnName}"`, ...filteredSubjectCodes.map(code => `"${code}"`)];
    if (meta.table_name === latestRegularFirstSemesterTable) {
        selectColumns.push('Name');
    }
    const formattedSelectString = selectColumns.join(',');

    allQueryPromises.push({
      queryId: `${meta.table_name}-${rollNoColumnName}`,
      tableName: meta.table_name,
      academicYear: meta.academic_year,
      academicSemester: meta.academic_semester,
      examYear: meta.exam_year,
      type: meta.result_type,
      rollColName: rollNoColumnName,
      promise: supabase.from(meta.table_name).select(formattedSelectString).eq(`"${rollNoColumnName}"`, studentIdToFetch)
    });
  });

  let results = [];
  try {
    const responses = await Promise.allSettled(allQueryPromises.map(q => q.promise));
    const groupedResponses = new Map();

    responses.forEach((response, index) => {
      const originalQueryInfo = allQueryPromises[index];
      if (!groupedResponses.has(originalQueryInfo.tableName)) {
        const meta = allExistingTablesMetadata.find(m => m.table_name === originalQueryInfo.tableName);
        groupedResponses.set(originalQueryInfo.tableName, { meta, results: [] });
      }
      groupedResponses.get(originalQueryInfo.tableName).results.push({
        rollColName: originalQueryInfo.rollColName,
        status: response.status,
        value: response.status === 'fulfilled' ? response.value : null,
        reason: response.status === 'rejected' ? response.reason : null,
      });
    });

    for (const [tableName, { meta, results: queryResults }] of groupedResponses.entries()) {
      let bestRecordForTable = null;
      for (const r of queryResults) {
          if (r.status === 'fulfilled' && r.value.data && r.value.data.length > 0) {
              bestRecordForTable = r.value.data[0];
              break;
          }
      }
      if (bestRecordForTable) {
        results.push({
          tableName: meta.table_name,
          academicYear: meta.academic_year,
          academicSemester: meta.academic_semester,
          examYear: meta.exam_year,
          type: meta.result_type,
          data: bestRecordForTable
        });
      }
    }
  } catch (err) {
    console.error("Error fetching student data concurrently:", err);
    return { error: 'Failed to fetch student data. Please try again.' };
  }

  const processedRawStudentRecords = {};
  let foundAnyData = false;

  results.filter(record => record.type === 'R').forEach(record => {
    foundAnyData = true;
    const { academicYear, academicSemester, examYear, data } = record;
    const semesterKey = `${academicYear}-${academicSemester}`;

    if (!processedRawStudentRecords[semesterKey] || examYear > processedRawStudentRecords[semesterKey].examYear) {
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
  });

  results.filter(record => record.type === 'I').forEach(record => {
    foundAnyData = true;
    const { academicYear, academicSemester, data } = record;
    const semesterKey = `${academicYear}-${academicSemester}`;

    const improvementRecord = data;
    const subjectCodes = getSubjectCodesForAcademicSemester(academicYear, academicSemester);

    if (!processedRawStudentRecords[semesterKey]) {
      processedRawStudentRecords[semesterKey] = {
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
        const originalGrade = processedRawStudentRecords[semesterKey]?.originalGrades[code];
        const currentAppliedGrade = processedRawStudentRecords[semesterKey]?.grades[code];

        const originalGradePoint = getGradePoint(originalGrade);
        const currentAppliedGradePoint = getGradePoint(currentAppliedGrade);
        const improvedGradePoint = getGradePoint(improvedGrade);

        const isEligibleForImprovement = originalGradePoint < getGradePoint('B-') || originalGrade === 'F';

        if (isEligibleForImprovement && improvedGradePoint > currentAppliedGradePoint) {
          processedRawStudentRecords[semesterKey].grades[code] = improvedGrade;
        } else if (currentAppliedGrade === undefined) {
           processedRawStudentRecords[semesterKey].grades[code] = improvedGrade;
           if (processedRawStudentRecords[semesterKey].originalGrades[code] === undefined) {
              processedRawStudentRecords[semesterKey].originalGrades[code] = improvedGrade;
           }
        }
      }
    });
  });

  if (!foundAnyData) {
    return { error: `No data found for Student ID: ${studentIdToFetch}.` };
  }

  let actualOverallTotalPoints = 0;
  let actualOverallTotalCredits = 0;
  const sortedActualSemesterKeys = Object.keys(processedRawStudentRecords).sort((a, b) => {
    const [yearA, semA] = a.split('-').map(Number);
    const [yearB, semB] = b.split('-').map(Number);
    if (yearA !== yearB) return yearA - yearB;
    return semA - b;
  });

  for (const semesterKey of sortedActualSemesterKeys) {
      const gradesMap = processedRawStudentRecords[semesterKey].grades;
      Object.values(gradesMap).forEach(gradeLetter => {
          const gradePoint = getGradePoint(gradeLetter);
          const credit = COURSE_CREDITS;
          actualOverallTotalPoints += gradePoint * credit;
          actualOverallTotalCredits += credit;
      });
  }
  const actualOverallCgpa = actualOverallTotalCredits > 0 ? parseFloat((actualOverallTotalPoints / actualOverallTotalCredits).toFixed(3)) : 0.000;


  const finalProcessedSemesters = {};
  const studentGpaHistory = [];
  const studentCgpaHistory = [];
  const studentYgpaHistory = [];

  let maxAcademicYearFromMetadata = 0;
  let maxAcademicSemesterFromMetadata = 0;
  allExistingTablesMetadata.forEach(meta => {
    if (meta.academic_year > maxAcademicYearFromMetadata) {
      maxAcademicYearFromMetadata = meta.academic_year;
      maxAcademicSemesterFromMetadata = meta.academic_semester;
    } else if (meta.academic_year === maxAcademicYearFromMetadata && meta.academic_semester > maxAcademicSemesterFromMetadata) {
      maxAcademicSemesterFromMetadata = meta.academic_semester;
    }
  });

  const maxAcademicYearToDisplay = Math.max(4, maxAcademicYearFromMetadata);
  const maxAcademicSemesterToDisplay = maxAcademicYearToDisplay === maxAcademicYearFromMetadata ? Math.max(2, maxAcademicSemesterFromMetadata) : 2;

  const allPossibleSemesterKeys = [];
  for (let y = 1; y <= maxAcademicYearToDisplay; y++) {
    for (let s = 1; s <= 2; s++) {
      if (y < maxAcademicYearToDisplay || (y === maxAcademicYearToDisplay && s <= maxAcademicSemesterToDisplay)) {
        allPossibleSemesterKeys.push(`${y}-${s}`);
      }
    }
  }
  allPossibleSemesterKeys.sort((a, b) => {
    const [yearA, semA] = a.split('-').map(Number);
    const [yearB, semB] = b.split('-').map(Number);
    if (yearA !== yearB) return yearA - yearB;
    return semA - b;
  });


  let currentCgpaAccumulator = { totalPoints: 0, totalCredits: 0 };
  let currentYearAccumulator = { totalPoints: 0, totalCredits: 0 };
  let lastProcessedYearInLoop = null;

  for (const semesterKey of allPossibleSemesterKeys) {
    const [academicYear, academicSemesterNum] = semesterKey.split('-').map(Number);
    const semesterDisplayName = `${academicYear} Year ${academicSemesterNum === 1 ? '1st' : '2nd'} Semester`;

    let semesterGpa = 0.000;
    let currentSemesterTotalPoints = 0;
    let currentSemesterTotalCredits = 0;
    let courseDetails = [];

    if (processedRawStudentRecords[semesterKey]) {
      const gradesMap = processedRawStudentRecords[semesterKey].grades;
      const originalGradesMap = processedRawStudentRecords[semesterKey].originalGrades;
      const subjectCodes = getSubjectCodesForAcademicSemester(academicYear, academicSemesterNum);

      subjectCodes.forEach(code => {
        const gradeLetter = gradesMap[code];
        const originalGradeLetter = originalGradesMap[code] || gradeLetter;
        const gradePoint = getGradePoint(gradeLetter);
        const credit = COURSE_CREDITS;

        currentSemesterTotalPoints += gradePoint * credit;
        currentSemesterTotalCredits += credit;

        courseDetails.push({
          courseCode: code,
          gradeLetter,
          gradePoint,
          originalGradeLetter: originalGradeLetter,
          hasImprovementOpportunity: getGradePoint(originalGradeLetter) < getGradePoint('B-') || originalGradeLetter === 'F',
          improvementApplied: (originalGradesMap[code] !== undefined && gradesMap[code] !== originalGradesMap[code])
        });
      });
      semesterGpa = currentSemesterTotalCredits > 0 ? parseFloat((currentSemesterTotalPoints / currentSemesterTotalCredits).toFixed(3)) : 0.000;

    } else {
      const subjectCodes = getSubjectCodesForAcademicSemester(academicYear, academicSemesterNum);
      courseDetails = subjectCodes.map(code => ({
        courseCode: code,
        gradeLetter: '',
        gradePoint: 0.000,
        originalGradeLetter: 'N/A',
        hasImprovementOpportunity: true,
        improvementApplied: false
      }));
      semesterGpa = 0.000;
      currentSemesterTotalPoints = 0;
      currentSemesterTotalCredits = COURSE_CREDITS * COURSES_PER_SEMESTER;
    }

    currentCgpaAccumulator.totalPoints += currentSemesterTotalPoints;
    currentCgpaAccumulator.totalCredits += currentSemesterTotalCredits;
    const currentCgpa = calculateCgpaFromSemesters({ current: currentCgpaAccumulator });

    if (lastProcessedYearInLoop === null || lastProcessedYearInLoop !== academicYear) {
      currentYearAccumulator = { totalPoints: 0, totalCredits: 0 };
      lastProcessedYearInLoop = academicYear;
    }
    currentYearAccumulator.totalPoints += currentSemesterTotalPoints;
    currentYearAccumulator.totalCredits += currentSemesterTotalCredits;
    const currentYgpa = currentYearAccumulator.totalCredits > 0 ? parseFloat((currentYearAccumulator.totalPoints / currentYearAccumulator.totalCredits).toFixed(3)) : 0.000;


    finalProcessedSemesters[semesterKey] = {
      semesterDisplayName,
      gpa: semesterGpa,
      cgpa: currentCgpa,
      ygpa: currentYgpa,
      courseDetails,
      totalPoints: currentSemesterTotalPoints,
      totalCredits: currentSemesterTotalCredits,
    };

    studentGpaHistory.push(semesterGpa);
    studentCgpaHistory.push(currentCgpa);
    studentYgpaHistory.push(currentYgpa);
  }

  const newOverallCgpa = actualOverallCgpa;

  return {
    id: studentIdToFetch,
    name: studentNameFound,
    semesters: finalProcessedSemesters,
    overallCgpa: newOverallCgpa,
    gpaHistory: studentGpaHistory,
    cgpaHistory: studentCgpaHistory,
  };
};


export default function GroupAnalysis() {
  // State for multiple student IDs for group analysis inputs
  const [studentInputs, setStudentInputs] = useState(
    Array.from({ length: 1 }, (_, i) => ({ id: i + 1, value: '' })) // Start with 1 input
  );
  const [groupStudentData, setGroupStudentData] = useState([]); // Stores processed data for all students in the group
  // Removed selectedStudentForDetails, as individual sections will be collapsible

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // State to track which student sections are expanded (by student ID)
  const [expandedStudentSections, setExpandedStudentSections] = useState(new Set());
  // State to track which semesters within a student's section are expanded (by studentId-semesterKey)
  const [expandedSemesters, setExpandedSemesters] = useState(new Set());


  // Chart data for the entire group
  const [groupGpaChartData, setGroupGpaChartData] = useState(null);
  const [groupCgpaChartData, setGroupCgpaChartData] = useState(null);

  // Expected grades for simulation (keyed by studentId-semesterKey-courseCode)
  const [expectedGrades, setExpectedGrades] = useState({});

  // Global required semester keys for chart labels (fetched once)
  const [requiredSemesterKeysGlobal, setRequiredSemesterKeysGlobal] = useState([]);

  // Function to recalculate student's results based on expected grades
  // MOVED INSIDE THE COMPONENT to resolve Invalid Hook Call
  const recalculateStudentResults = useCallback((baseStudentData, currentExpectedGrades) => {
    if (!baseStudentData || !baseStudentData.semesters) return null;

    const newSemesters = {};
    let overallTotalPoints = 0;
    let overallTotalCredits = 0;
    let lastProcessedYearInRecalculate = null;
    let currentYearAccumulator = { totalPoints: 0, totalCredits: 0 };

    const sortedSemesterKeys = Object.keys(baseStudentData.semesters).sort((a, b) => {
        const [yearA, semA] = a.split('-').map(Number);
        const [yearB, semB] = b.split('-').map(Number);
        if (yearA !== yearB) return yearA - yearB;
        return semA - b;
    });

    for (const semesterKey of sortedSemesterKeys) {
        const originalSem = baseStudentData.semesters[semesterKey];
        if (!originalSem) {
            continue;
        }
        const [academicYear, academicSemesterNum] = semesterKey.split('-').map(Number);

        let semesterAdjustedTotalPoints = 0;
        let semesterAdjustedTotalCredits = 0;
        const newCourseDetails = originalSem.courseDetails.map(course => {
            // Key now includes student ID
            const expectedGradeKey = `${baseStudentData.id}-${semesterKey}-${course.courseCode}`;
            const expectedGradeLetter = currentExpectedGrades[expectedGradeKey];

            let gradeToUse = course.gradeLetter;
            let gradePointToUse = getGradePoint(course.gradeLetter);

            if (expectedGradeLetter && getGradePoint(expectedGradeLetter) !== undefined &&
               (getGradePoint(expectedGradeLetter) > gradePointToUse || course.originalGradeLetter === 'N/A')) {
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

        const newSemesterGpa = semesterAdjustedTotalCredits > 0 ? parseFloat((semesterAdjustedTotalPoints / semesterAdjustedTotalCredits).toFixed(3)) : 0.000;

        overallTotalPoints += semesterAdjustedTotalPoints;
        overallTotalCredits += semesterAdjustedTotalCredits;
        const newCurrentCgpa = overallTotalCredits > 0 ? parseFloat((overallTotalPoints / overallTotalCredits).toFixed(3)) : 0.000;

        if (lastProcessedYearInRecalculate === null || lastProcessedYearInRecalculate !== academicYear) {
            currentYearAccumulator = { totalPoints: 0, totalCredits: 0 };
            lastProcessedYearInRecalculate = academicYear;
        }
        currentYearAccumulator.totalPoints += semesterAdjustedTotalPoints;
        currentYearAccumulator.totalCredits += semesterAdjustedTotalCredits;
        const newCurrentYgpa = currentYearAccumulator.totalCredits > 0 ? parseFloat((currentYearAccumulator.totalPoints / currentYearAccumulator.totalCredits).toFixed(3)) : 0.000;


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

    const newOverallCgpa = overallTotalCredits > 0 ? parseFloat((overallTotalPoints / overallTotalCredits).toFixed(3)) : 0.000;

    return {
        ...baseStudentData,
        semesters: newSemesters,
        overallCgpa: newOverallCgpa,
        gpaHistory: sortedSemesterKeys.map(key => newSemesters[key]?.gpa || 0),
        cgpaHistory: sortedSemesterKeys.map(key => newSemesters[key]?.cgpa || 0),
    };
  }, [calculateCgpaFromSemesters, calculateYgpaFromYears]); // Dependencies for useCallback


  // Fetch global required semester keys on mount
  useEffect(() => {
    const fetchGlobalSemesterKeys = async () => {
      if (supabase && typeof supabase.from === 'function') {
        try {
          const allExistingTablesMetadata = await fetchExistingTableNames();
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

          const allPossibleSemesterKeys = [];
          for (let y = 1; y <= Math.max(4, maxAcademicYear); y++) { // Ensure at least 4 years for consistency
            for (let s = 1; s <= 2; s++) {
              if (y < Math.max(4, maxAcademicYear) || (y === Math.max(4, maxAcademicYear) && s <= Math.max(2, maxAcademicSemester))) {
                allPossibleSemesterKeys.push(`${y}-${s}`);
              }
            }
          }
          allPossibleSemesterKeys.sort((a, b) => {
            const [yearA, semA] = a.split('-').map(Number);
            const [yearB, semB] = b.split('-').map(Number);
            if (yearA !== yearB) return yearA - yearB;
            return semA - b;
          });
          setRequiredSemesterKeysGlobal(allPossibleSemesterKeys);
        } catch (err) {
          console.error("Error fetching global semester keys:", err);
        }
      }
    };
    fetchGlobalSemesterKeys();
  }, []);


  const handleAddInput = () => {
    if (studentInputs.length < 10) {
      setStudentInputs([...studentInputs, { id: studentInputs.length + 1, value: '' }]);
    }
  };

  const handleRemoveInput = (idToRemove) => {
    if (studentInputs.length > 1) { // Ensure at least one input remains
      setStudentInputs(studentInputs.filter(input => input.id !== idToRemove));
    }
  };

  const handleStudentIdChange = (id, newValue) => {
    setStudentInputs(studentInputs.map(input =>
      input.id === id ? { ...input, value: newValue } : input
    ));
  };

  const fetchGroupData = useCallback(async () => {
    setLoading(true);
    setError('');
    setGroupStudentData([]);
    setExpandedStudentSections(new Set()); // Clear expanded sections
    setExpandedSemesters(new Set()); // Clear expanded semesters
    setGroupGpaChartData(null); // Clear group chart data
    setGroupCgpaChartData(null); // Clear group chart data
    setExpectedGrades({}); // Clear expected grades on new search

    const validStudentIds = studentInputs
      .map(input => input.value.trim())
      .filter(id => id.length === 10);

    if (validStudentIds.length === 0) {
      setError('Please enter at least one valid 10-digit Student ID.');
      setLoading(false);
      return;
    }

    const promises = validStudentIds.map(id => fetchAndProcessSingleStudentData(id));
    const results = await Promise.all(promises);

    const processedData = results.filter(res => !res.error);
    const errors = results.filter(res => res.error).map(res => res.error);

    if (errors.length > 0) {
      setError(`Errors fetching data: ${errors.join('; ')}`);
    }

    // Calculate GPA Standard Deviation for each student
    const studentsWithStdDev = processedData.map(student => {
      const gpasForStdDev = Object.values(student.semesters).map(sem => sem.gpa);
      let gpaStandardDeviation = 0;
      if (gpasForStdDev.length > 1) {
        const meanGpa = gpasForStdDev.reduce((sum, gpa) => sum + gpa, 0) / gpasForStdDev.length;
        const sumOfSquaredDifferences = gpasForStdDev.reduce((sum, gpa) => sum + Math.pow(gpa - meanGpa, 2), 0);
        gpaStandardDeviation = parseFloat(Math.sqrt(sumOfSquaredDifferences / (gpasForStdDev.length - 1)).toFixed(3));
      }
      // Extract session from student ID (first two digits)
      const session = parseInt(student.id.substring(0, 2), 10);

      return {
        ...student,
        gpaStandardDeviation: gpaStandardDeviation,
        session: session,
      };
    });

    // Apply the new sorting logic: CGPA (desc) > Std Dev (asc) > Session (asc) > Roll (asc)
    studentsWithStdDev.sort((a, b) => {
      // 1. CGPA (descending)
      if (b.overallCgpa !== a.overallCgpa) return b.overallCgpa - a.overallCgpa;
      // 2. GPA Standard Deviation (ascending)
      if (a.gpaStandardDeviation !== b.gpaStandardDeviation) return a.gpaStandardDeviation - b.gpaStandardDeviation;
      // 3. Session (ascending)
      if (a.session !== b.session) return a.session - b.session;
      // 4. Student ID (Roll) (ascending)
      return a.id.localeCompare(b.id);
    });

    setGroupStudentData(studentsWithStdDev);
    setLoading(false);
  }, [studentInputs, recalculateStudentResults]);


  // Effect to update group chart data when groupStudentData changes
  useEffect(() => {
    if (groupStudentData.length > 0 && requiredSemesterKeysGlobal.length > 0) {
      const allSemesterLabels = requiredSemesterKeysGlobal.map(key => {
        const [year, sem] = key.split('-').map(Number);
        return `${year} Year ${sem === 1 ? '1st' : '2nd'} Semester`;
      });

      const generateGroupDatasets = (type) => {
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

        return groupStudentData.map((student, index) => {
          // Recalculate student data based on their specific expected grades
          const studentExpectedGrades = Object.keys(expectedGrades)
            .filter(key => key.startsWith(`${student.id}-`))
            .reduce((obj, key) => {
              const semesterCourseKey = key.substring(student.id.length + 1); // Remove student ID prefix
              obj[semesterCourseKey] = expectedGrades[key];
              return obj;
            }, {});

          const simulatedStudentData = recalculateStudentResults(student, studentExpectedGrades);

          const dataPoints = allSemesterLabels.map(label => {
            const semesterKey = requiredSemesterKeysGlobal.find(key => {
                const [year, sem] = key.split('-').map(Number);
                return label === `${year} Year ${sem === 1 ? '1st' : '2nd'} Semester`;
            });
            const semesterData = simulatedStudentData.semesters[semesterKey];
            return semesterData ? (type === 'gpa' ? semesterData.gpa : semesterData.cgpa) : null;
          });

          // Extract last name for chart label
          const nameParts = student.name.split(' ');
          const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : student.name; // Fallback to full name

          return {
            label: lastName, // Use last name
            data: dataPoints,
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length].replace('1)', '0.2)'),
            fill: false,
            tension: 0.3,
          };
        });
      };

      setGroupGpaChartData({
        labels: allSemesterLabels,
        datasets: generateGroupDatasets('gpa'),
      });

      setGroupCgpaChartData({
        labels: allSemesterLabels,
        datasets: generateGroupDatasets('cgpa'),
      });
    }
  }, [groupStudentData, requiredSemesterKeysGlobal, expectedGrades, recalculateStudentResults]);


  const handleExpectedGradeChange = (studentId, semesterKey, courseCode, value) => {
    const newExpectedGrades = { ...expectedGrades };
    const key = `${studentId}-${semesterKey}-${courseCode}`; // Key by student ID as well

    if (value.trim() === '') {
      delete newExpectedGrades[key];
    } else {
      newExpectedGrades[key] = value.toUpperCase();
    }
    setExpectedGrades(newExpectedGrades);
  };

  const toggleStudentSection = (studentId) => {
    setExpandedStudentSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(studentId)) {
        newSet.delete(studentId);
      } else {
        newSet.add(studentId);
      }
      return newSet;
    });
  };

  const toggleSemesterExpansion = (studentId, semesterKey) => {
    const key = `${studentId}-${semesterKey}`;
    setExpandedSemesters(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  return (
    <section className="container mx-auto p-4 pt-16 text-white">
      <h1 className="text-3xl font-bold mb-6 text-center">Group Student Analysis</h1>

      <div className="bg-gray-800 p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-2xl font-semibold mb-4">Enter Student IDs</h2>
        <div className="space-y-3 mb-4">
          {studentInputs.map((input, index) => (
            <div key={input.id} className="flex items-center space-x-2">
              <input
                type="text"
                placeholder={`Student ID ${index + 1}`}
                className="p-3 border border-gray-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex-grow"
                value={input.value}
                onChange={(e) => handleStudentIdChange(input.id, e.target.value)}
                maxLength={10}
              />
              {studentInputs.length > 1 && (
                <button
                  onClick={() => handleRemoveInput(input.id)}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        {studentInputs.length < 10 && (
          <button
            onClick={handleAddInput}
            className="px-6 py-3 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 mb-4"
          >
            Add Another Student ID
          </button>
        )}
        <button
          onClick={fetchGroupData}
          className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <th className="py-3 px-4 border-b border-gray-600">Std. Dev.</th> {/* Added Std. Dev. header */}
                  <th className="py-3 px-4 border-b border-gray-600">Session</th> {/* Added Session header */}
                  <th className="py-3 px-4 border-b border-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groupStudentData.map((student, index) => {
                  return (
                    <tr key={student.id} className="hover:bg-gray-600">
                      <td className="py-2 px-4 border-b border-gray-600">{index + 1}</td> {/* Simple index-based rank for display */}
                      <td className="py-2 px-4 border-b border-gray-600">{student.id}</td>
                      <td className="py-2 px-4 border-b border-gray-600">{student.name}</td>
                      <td className="py-2 px-4 border-b border-gray-600">{student.overallCgpa.toFixed(3)}</td>
                      <td className="py-2 px-4 border-b border-gray-600">{student.gpaStandardDeviation.toFixed(3)}</td> {/* Display Std. Dev. */}
                      <td className="py-2 px-4 border-b border-gray-600">{student.session}</td> {/* Display Session */}
                      <td className="py-2 px-4 border-b border-gray-600">
                        <button
                          onClick={() => toggleStudentSection(student.id)}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        >
                          {expandedStudentSections.has(student.id) ? 'Hide Details' : 'View Details'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* GPA Trend Chart for the Group */}
          {groupGpaChartData && (
            <div className="mt-8 p-4 rounded-lg max-w-4xl mx-auto bg-white">
              <h3 className="text-xl font-semibold mb-4 text-center text-gray-800">GPA Trend for Group Students</h3>
              <ResultTrendChart
                labels={groupGpaChartData.labels}
                datasets={groupGpaChartData.datasets}
                title="GPA Trend"
                yAxisLabel="GPA"
              />
            </div>
          )}

          {/* CGPA Trend Chart for the Group */}
          {groupCgpaChartData && (
            <div className="mt-8 p-4 rounded-lg max-w-4xl mx-auto bg-white">
              <h3 className="text-xl font-semibold mb-4 text-center text-gray-800">CGPA Trend for Group Students</h3>
              <ResultTrendChart
                labels={groupCgpaChartData.labels}
                datasets={groupCgpaChartData.datasets}
                title="CGPA Trend"
                yAxisLabel="CGPA"
              />
            </div>
          )}

          {/* Individual Collapsible Sections for Each Student */}
          {groupStudentData.map(student => {
            const isStudentSectionExpanded = expandedStudentSections.has(student.id);

            // Recalculate student data based on their specific expected grades for individual charts/details
            const studentExpectedGrades = Object.keys(expectedGrades)
              .filter(key => key.startsWith(`${student.id}-`))
              .reduce((obj, key) => {
                const semesterCourseKey = key.substring(student.id.length + 1); // Remove student ID prefix
                obj[semesterCourseKey] = expectedGrades[key];
                return obj;
              }, {});
            const simulatedStudentData = recalculateStudentResults(student, studentExpectedGrades);


            // Generate individual chart data for this specific student
            const allSemesterLabels = requiredSemesterKeysGlobal.map(key => {
              const [year, sem] = key.split('-').map(Number);
              return `${year} Year ${sem === 1 ? '1st' : '2nd'} Semester`;
            });

            const individualGpaChartDatasets = [
              {
                label: `${simulatedStudentData.name}'s GPA`,
                data: allSemesterLabels.map(label => {
                  const semesterKey = requiredSemesterKeysGlobal.find(key => {
                      const [year, sem] = key.split('-').map(Number);
                      return label === `${year} Year ${sem === 1 ? '1st' : '2nd'} Semester`;
                  });
                  return simulatedStudentData.semesters[semesterKey]?.gpa || 0;
                }),
                borderColor: 'rgba(0, 123, 255, 1)',
                backgroundColor: 'rgba(0, 123, 255, 0.2)',
                fill: true,
                tension: 0.3,
              },
            ];

            const individualCgpaChartDatasets = [
              {
                label: `${simulatedStudentData.name}'s CGPA`,
                data: allSemesterLabels.map(label => {
                  const semesterKey = requiredSemesterKeysGlobal.find(key => {
                      const [year, sem] = key.split('-').map(Number);
                      return label === `${year} Year ${sem === 1 ? '1st' : '2nd'} Semester`;
                  });
                  return simulatedStudentData.semesters[semesterKey]?.cgpa || 0;
                }),
                borderColor: 'rgba(40, 167, 69, 1)',
                backgroundColor: 'rgba(40, 167, 69, 0.2)',
                fill: true,
                tension: 0.3,
              },
            ];


            return (
              <div key={`details-${student.id}`} className="mt-8 p-6 rounded-lg shadow-md bg-gray-700">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-semibold text-white">Details for: {student.name} ({student.id})</h2>
                  <button
                    onClick={() => toggleStudentSection(student.id)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  >
                    {isStudentSectionExpanded ? 'Hide Details' : 'View Details'}
                  </button>
                </div>

                {isStudentSectionExpanded && (
                  <>
                    {/* Individual GPA Trend Chart */}
                    {simulatedStudentData && (
                      <div className="mt-8 p-4 rounded-lg max-w-4xl mx-auto bg-white">
                        <h3 className="text-xl font-semibold mb-4 text-center text-gray-800">Individual GPA Trend</h3>
                        <ResultTrendChart
                          labels={allSemesterLabels}
                          datasets={individualGpaChartDatasets}
                          title="Individual GPA Trend"
                          yAxisLabel="GPA"
                        />
                      </div>
                    )}

                    {/* Individual CGPA Trend Chart */}
                    {simulatedStudentData && (
                      <div className="mt-8 p-4 rounded-lg max-w-4xl mx-auto bg-white">
                        <h3 className="text-xl font-semibold mb-4 text-center text-gray-800">Individual CGPA Trend</h3>
                        <ResultTrendChart
                          labels={allSemesterLabels}
                          datasets={individualCgpaChartDatasets}
                          title="Individual CGPA Trend"
                          yAxisLabel="CGPA"
                        />
                      </div>
                    )}

                    <h3 className="text-xl font-semibold mb-4 text-center mt-8">Semester-wise Details</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-gray-800 rounded-lg text-left text-white">
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
                            <React.Fragment key={`${student.id}-${semesterKey}`}>
                              <tr
                                className="hover:bg-gray-600 cursor-pointer"
                                onClick={() => toggleSemesterExpansion(student.id, semesterKey)}
                              >
                                <td className="py-2 px-4 border-b border-gray-600">{sem.semesterDisplayName}</td>
                                <td className="py-2 px-4 border-b border-gray-600">{sem.gpa.toFixed(3)}</td>
                                <td className="py-2 px-4 border-b border-gray-600">{sem.ygpa.toFixed(3)}</td>
                                <td className="py-2 px-4 border-b border-gray-600">{sem.cgpa.toFixed(3)}</td>
                                <td className="py-2 px-4 border-b border-gray-600">
                                  {expandedSemesters.has(`${student.id}-${semesterKey}`) ? '▲ Hide' : '▼ Show'}
                                </td>
                              </tr>
                              {expandedSemesters.has(`${student.id}-${semesterKey}`) && (
                                <tr>
                                  <td colSpan="5" className="py-4 px-4 bg-gray-700">
                                    <h4 className="text-lg font-semibold mb-2 text-gray-200">Courses & Grades</h4>
                                    {sem.courseDetails && sem.courseDetails.length > 0 ? (
                                      <div className="overflow-x-auto">
                                        <table className="min-w-full bg-gray-800 rounded-lg text-left text-white text-sm">
                                          <thead>
                                            <tr>
                                              <th className="py-2 px-3 border-b border-gray-600">Course Code</th>
                                              <th className="py-2 px-3 border-b border-gray-600">Regular Grade</th>
                                              <th className="py-2 px-3 border-b border-gray-600">Expected or Target Grade</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {sem.courseDetails.map((course, idx) => (
                                              <tr key={`${student.id}-${semesterKey}-${course.courseCode}-${idx}`} className="hover:bg-gray-700">
                                                <td className="py-2 px-3 border-b border-gray-600">{course.courseCode}</td>
                                                <td className="py-2 px-3 border-b border-gray-600">
                                                  {course.originalGradeLetter !== 'N/A' ? (
                                                    <span className="font-bold">{course.originalGradeLetter} ({getGradePoint(course.originalGradeLetter).toFixed(3)})</span>
                                                  ) : (
                                                    <span className="text-gray-400">N/A</span>
                                                  )}
                                                </td>
                                                <td className="py-2 px-3 border-b border-gray-600">
                                                  {course.improvementApplied ? (
                                                    <span className="font-bold text-green-400">{course.gradeLetter} ({course.gradePoint.toFixed(3)})</span>
                                                  ) : (course.hasImprovementOpportunity || course.originalGradeLetter === 'N/A') ? (
                                                    <div className="flex items-center">
                                                      {course.gradeLetter === 'F' && (
                                                        <span className="bg-red-700 text-white px-3 py-1.5 rounded-md mr-2 font-bold text-xl shadow-lg">F!</span>
                                                      )}
                                                      <input
                                                        type="text"
                                                        className="p-1 w-24 border border-gray-600 rounded-md bg-gray-900 text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                        value={expectedGrades[`${student.id}-${semesterKey}-${course.courseCode}`] || ''}
                                                        onChange={(e) => handleExpectedGradeChange(student.id, semesterKey, course.courseCode, e.target.value)}
                                                        placeholder={course.originalGradeLetter === 'N/A' ? 'Target Grade' : course.originalGradeLetter}
                                                        maxLength={2}
                                                      />
                                                    </div>
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
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        !loading && !error && (
          <div className="bg-gray-800 p-6 rounded-lg shadow-md text-center text-gray-300">
            <p>Enter Student IDs above to view group results.</p>
          </div>
        )
      )}

      {/* Back to Single Student Analysis Button */}
      <div className="mt-12 text-center">
        <Link
          to="/"
          className="inline-block px-8 py-4 bg-gradient-to-r from-green-700 to-lime-700 text-white font-bold text-xl rounded-full shadow-lg hover:from-green-800 hover:to-lime-800 focus:outline-none focus:ring-4 focus:ring-green-500 focus:ring-opacity-50 transition transform hover:scale-105 active:scale-95"
        >
          Back to Single Student Analysis
        </Link>
      </div>
    </section>
  );
}
