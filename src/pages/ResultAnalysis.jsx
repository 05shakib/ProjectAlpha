import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient'; // Ensure this path is correct
import ResultTrendChart from '../components/ResultTrendChart';
import {
  COURSE_CREDITS,
  fetchExistingTableNames,
  getSubjectCodesForAcademicSemester,
  getGradePoint
} from '../lib/dataUtils';

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
  const [requiredSemesterKeysGlobal, setRequiredSemesterKeysGlobal] = useState([]); // To store required semester keys globally

  // New state for expected improvement grades
  const [expectedGrades, setExpectedGrades] = useState({}); // Corrected: This line is standard React useState usage

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
    // 'Roll no.' will be used, both for select and eq
    const rollNoColumnName = 'Roll no.';

    // --- Start: Logic to fetch student name from a single table ---
    let studentNameFound = `Student ${studentId}`; // Default name
    let latestRegularFirstSemesterTable = null;
    let latestRegularFirstSemesterExamYear = -1;

    // Find the latest 'R' type table for the 1st semester
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
          .eq(`"${rollNoColumnName}"`, studentId)
          .single(); // Use .single() as we expect one record

        if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows found"
          console.warn(`Error fetching name from ${latestRegularFirstSemesterTable}:`, error.message);
        }

        if (data && data.Name) {
          studentNameFound = data.Name;
        }
      } catch (err) {
        console.warn(`Unexpected error fetching name from ${latestRegularFirstSemesterTable}:`, err);
      }
    }
    // --- End: Logic to fetch student name from a single table ---


    allExistingTablesMetadata.forEach(meta => {
      const subjectCodesForSemester = getSubjectCodesForAcademicSemester(meta.academic_year, meta.academic_semester);
      // Ensure subjectCodesForSemester only contains valid strings
      const filteredSubjectCodes = subjectCodesForSemester.filter(code => typeof code === 'string' && code.length > 0);

      // Construct the select string
      // Only include 'Name' if this is the specific table identified for name fetching
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
        // Pass the explicitly formatted string to .select()
        promise: supabase.from(meta.table_name).select(formattedSelectString).eq(`"${rollNoColumnName}"`, studentId)
      });
    });

    let results = [];
    
    try {
      const responses = await Promise.allSettled(allQueryPromises.map(q => q.promise));

      // Group results by table name to pick the best one (though now there's only one per table)
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

      // Process grouped responses to select the best result for each table
      for (const [tableName, { meta, results: queryResults }] of groupedResponses.entries()) {
        let bestRecordForTable = null;

        // Since only 'Roll no.' is queried, just take the first successful result
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
          // The studentNameFound is already determined above, so no need to update it here
        } else {
          // console.warn(`No data found for student ${studentId} in table ${tableName} using "${rollNoColumnName}".`);
        }
      }

    } catch (err) {
      console.error("Error fetching student data concurrently:", err);
      setError('Failed to fetch student data. Please try again.');
      setLoading(false);
      return;
    }

    const processedRawStudentRecords = {};
    let foundAnyData = false;

    // First pass: Process all Regular records to establish original grades
    results.filter(record => record.type === 'R').forEach(record => {
      foundAnyData = true;
      const { academicYear, academicSemester, examYear, data } = record;
      const semesterKey = `${academicYear}-${academicSemester}`;

      if (!processedRawStudentRecords[semesterKey] || examYear > processedRawStudentRecords[semesterKey].examYear) {
        processedRawStudentRecords[semesterKey] = {
          examYear: examYear,
          type: 'R',
          grades: {}, // Stores the final (regular or improved) grade
          originalGrades: {}, // Stores the original regular grade for comparison
          gpa: data.GPA,
          ygpa: data.YGPA
        };
        const subjectCodes = getSubjectCodesForAcademicSemester(academicYear, academicSemester);
        subjectCodes.forEach(code => {
          if (data[code] !== undefined && data[code] !== null) {
            processedRawStudentRecords[semesterKey].grades[code] = data[code];
            processedRawStudentRecords[semesterKey].originalGrades[code] = data[code]; // Store original regular grade
          }
        });
      }
    });

    // Second pass: Process Improvement records, applying them on top of established regular grades
    results.filter(record => record.type === 'I').forEach(record => {
      foundAnyData = true;
      const { academicYear, academicSemester, data } = record;
      const semesterKey = `${academicYear}-${academicSemester}`;

      const improvementRecord = data;
      const subjectCodes = getSubjectCodesForAcademicSemester(academicYear, academicSemester);

      // Ensure there's a base regular record for this semester before applying improvements
      if (!processedRawStudentRecords[semesterKey]) {
        // This case means an improvement record exists without a regular one.
        // We'll treat the improvement grades as the 'original' if no regular exists.
        processedRawStudentRecords[semesterKey] = {
          examYear: -1, // No specific regular exam year
          type: 'I', // Mark as primarily improvement-driven
          grades: {},
          originalGrades: {},
          gpa: improvementRecord.GPA || 0.00, // Use GPA from improvement if available
          ygpa: improvementRecord.YGPA || 0.00
        };
      }

      subjectCodes.forEach(code => {
        const improvedGrade = improvementRecord[code];
        
        // Ensure improvedGrade is a valid string and has a corresponding grade point
        const isValidImprovedGrade = typeof improvedGrade === 'string' && getGradePoint(improvedGrade) !== undefined;

        if (isValidImprovedGrade) {
          const originalGrade = processedRawStudentRecords[semesterKey]?.originalGrades[code]; // Original regular grade
          const currentAppliedGrade = processedRawStudentRecords[semesterKey]?.grades[code]; // Currently applied grade (might be regular or previous improvement)

          const originalGradePoint = getGradePoint(originalGrade);
          const currentAppliedGradePoint = getGradePoint(currentAppliedGrade);
          const improvedGradePoint = getGradePoint(improvedGrade);

          // Eligibility: original grade was below B- OR original grade was F
          const isEligibleForImprovement = originalGradePoint < getGradePoint('B-') || originalGrade === 'F';

          // Apply improvement only if it's valid and strictly better than the current *applied* grade
          // AND the original grade was eligible for improvement
          if (isEligibleForImprovement && improvedGradePoint > currentAppliedGradePoint) {
            processedRawStudentRecords[semesterKey].grades[code] = improvedGrade;
          } else if (currentAppliedGrade === undefined) {
             // If no grade (regular or previous improvement) existed for this course, apply the improvement grade.
             // This handles courses that might only appear in an improvement record.
             processedRawStudentRecords[semesterKey].grades[code] = improvedGrade;
             // If no original grade was set, this improvement becomes the de-facto original for eligibility checks
             if (processedRawStudentRecords[semesterKey].originalGrades[code] === undefined) {
                processedRawStudentRecords[semesterKey].originalGrades[code] = improvedGrade;
             }
          }
        }
      });
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
      const subjectCodes = getSubjectCodesForAcademicSemester(academicYear, academicSemesterNum); // Use all expected subject codes

      let semesterTotalPoints = 0;
      let semesterTotalCredits = 0;
      const courseDetails = [];

      subjectCodes.forEach(code => {
        const gradeLetter = gradesMap[code]; // This is the final, potentially improved grade
        const originalGradeLetter = originalGradesMap[code] || gradeLetter; // Fallback to current if no explicit original
        const gradePoint = getGradePoint(gradeLetter);
        const credit = COURSE_CREDITS;

        semesterTotalPoints += gradePoint * credit;
        semesterTotalCredits += credit;

        courseDetails.push({
          courseCode: code,
          gradeLetter, // This is the final, potentially improved grade
          gradePoint,
          originalGradeLetter: originalGradeLetter, // This is the original regular grade
          hasImprovementOpportunity: getGradePoint(originalGradeLetter) < getGradePoint('B-') || originalGradeLetter === 'F',
          // Flag to indicate if an official improvement was applied from DB data
          improvementApplied: (originalGradesMap[code] !== undefined && gradesMap[code] !== originalGradesMap[code])
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
      name: studentNameFound, // Use the fetched student name
      semesters: finalProcessedSemesters,
      overallCgpa: currentCgpaAccumulator.totalCredits > 0 ? parseFloat((currentCgpaAccumulator.totalPoints / currentCgpaAccumulator.totalCredits).toFixed(2)) : 0.00,
      // Store initial GPA/CGPA history for charts
      gpaHistory: studentGpaHistory,
      cgpaHistory: studentCgpaHistory,
    };

    setStudentData(newStudentData);
    setSimulatedStudentData(newStudentData); // Initialize simulated data with fetched data

    setLoading(false);
  }, [studentId, calculateGpa, calculateCgpaFromSemesters, calculateYgpaFromYears]);

  // Helper function to process all students' raw data into structured semester data
  const processAllStudentsSemesterData = useCallback(async (allExistingTablesMetadata) => {
    console.time("processAllStudentsSemesterData");

    let allStudentsRawData = {};
    const allStudentQueryPromises = [];

    // 1. Identify latestRegularFirstSemesterTable globally (once)
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
    console.log("Latest regular first semester table for batch names:", latestRegularFirstSemesterTable);

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

    // 'Roll no.' will be used for batch queries
    const rollNoColumnName = 'Roll no.';

    allExistingTablesMetadata.forEach(meta => {
      const subjectCodesForTable = getSubjectCodesForAcademicSemester(meta.academic_year, meta.academic_semester);
      // Ensure subjectCodesForTable only contains valid strings
      const filteredSubjectCodesForTable = subjectCodesForTable.filter(code => typeof code === 'string' && code.length > 0);

      // Construct the select string for batch data: Conditionally include 'Name'
      let selectColumnsForTable = [`"${rollNoColumnName}"`, ...filteredSubjectCodesForTable.map(code => `"${code}"`)];
      if (meta.table_name === latestRegularFirstSemesterTable) {
          selectColumnsForTable.push('Name'); // Only include Name for this specific table
      }
      const formattedSelectStringForTable = selectColumnsForTable.join(',');

      allStudentQueryPromises.push({
        tableName: meta.table_name,
        academicYear: meta.academic_year,
        academicSemester: meta.academic_semester,
        examYear: meta.exam_year,
        type: meta.result_type,
        rollColName: rollNoColumnName,
        // Pass the explicitly formatted string to .select()
        promise: supabase.from(meta.table_name).select(formattedSelectStringForTable).then(response => {
          // Handle potential errors or empty data for individual promises
          if (response.error) {
            console.error(`Error fetching data for table ${meta.table_name}:`, response.error);
            return { data: [], error: response.error }; // Return empty data on error
          }
          return response;
        })
      });
    });

    const responses = await Promise.allSettled(allStudentQueryPromises.map(q => q.promise));

    // Group responses by table and then by student
    const tempStudentData = new Map(); // Map to hold student data temporarily, including their best name

    responses.forEach((response, index) => {
      const originalQueryInfo = allStudentQueryPromises[index];
      if (response.status === 'fulfilled' && response.value.data && response.value.data.length > 0) {
        response.value.data.forEach(studentRecord => {
          // Dynamically get roll using the actual column name that was successfully queried
          const studentRoll = studentRecord[originalQueryInfo.rollColName];
          if (!studentRoll) return;

          if (!tempStudentData.has(studentRoll)) {
            tempStudentData.set(studentRoll, {
              name: `Student ${studentRoll}`, // Initialize with default name
              records: new Map()
            });
          }
          const studentEntry = tempStudentData.get(studentRoll);

          // If this record contains a Name and it's from the designated name-fetching table, update the student's name
          if (originalQueryInfo.tableName === latestRegularFirstSemesterTable && studentRecord.Name) {
              studentEntry.name = studentRecord.Name;
          }

          if (!studentEntry.records.has(originalQueryInfo.tableName)) {
            studentEntry.records.set(originalQueryInfo.tableName, {
              bestRecord: null,
              bestRollColName: null,
              meta: originalQueryInfo
            });
          }
          const tableEntry = studentEntry.records.get(originalQueryInfo.tableName);

          // Assign directly
          tableEntry.bestRecord = studentRecord;
          tableEntry.bestRollColName = originalQueryInfo.rollColName;
        });
      }
    });

    // Flatten tempStudentData into allStudentsRawData
    for (const [studentRoll, studentEntry] of tempStudentData.entries()) {
      allStudentsRawData[studentRoll] = {
        name: studentEntry.name, // Use the potentially updated name
        records: []
      };
      for (const [tableName, tableEntry] of studentEntry.records.entries()) {
        if (tableEntry.bestRecord) {
          allStudentsRawData[studentRoll].records.push({
            tableName: tableEntry.meta.tableName,
            academicYear: tableEntry.meta.academicYear,
            academicSemester: tableEntry.meta.academicSemester,
            examYear: tableEntry.meta.exam_year,
            type: tableEntry.meta.type,
            data: tableEntry.bestRecord
          });
        }
      }
    }

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

      // First pass: Process all Regular records to establish original grades
      sortedRecords.filter(record => record.type === 'R').forEach(record => {
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

      // Second pass: Process Improvement records, applying them on top of established regular grades
      sortedRecords.filter(record => record.type === 'I').forEach(record => {
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
        name: student.name, // This will be "Student [ID]" for batch data, or the actual name for the current student
        overallCgpa: studentOverallCgpa,
        semesters: processedSemestersForThisStudent,
        isComplete: hasAllRequiredSemesters,
        gpaHistory: studentSemesterGpas, // Semester-wise GPA
        cgpaHistory: studentSemesterCgpas, // Semester-wise CGPA
      };
    }

    console.timeEnd("processAllStudentsSemesterData");
    return { allStudentsFullProcessedData, requiredSemesterKeys };
  }, [calculateGpa, calculateCgpaFromSemesters]);


  // New function to recalculate student's results based on expected grades
  // This function now returns the new simulated student data
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
            continue;
        }
        const [academicYear, academicSemesterNum] = semesterKey.split('-').map(Number);

        let semesterAdjustedTotalPoints = 0;
        let semesterAdjustedTotalCredits = 0;
        const newCourseDetails = originalSem.courseDetails.map(course => {
            const expectedGradeKey = `${semesterKey}-${course.courseCode}`;
            const expectedGradeLetter = currentExpectedGrades[expectedGradeKey];

            // Start with the grade that was already determined from the database (original OR applied improvement)
            let gradeToUse = course.gradeLetter; 
            let gradePointToUse = getGradePoint(course.gradeLetter);

            // If an expected grade is provided and it's a valid grade, and it's an improvement over the *current* grade
            if (expectedGradeLetter && getGradePoint(expectedGradeLetter) !== undefined && getGradePoint(expectedGradeLetter) > gradePointToUse) {
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

    return {
        ...baseStudentData, // Copy original student data properties
        semesters: newSemesters,
        overallCgpa: newOverallCgpa,
        gpaHistory: sortedSemesterKeys.map(key => newSemesters[key]?.gpa || 0),
        cgpaHistory: sortedSemesterKeys.map(key => newSemesters[key]?.cgpa || 0),
    };
  }, [calculateCgpaFromSemesters, calculateYgpaFromYears]);


  // New function to calculate overall ranks and chart averages for all students
  const calculateOverallRankAndChartAverages = useCallback(async () => {
    console.time("calculateOverallRankAndChartAverages");

    if (!supabase || typeof supabase.from !== 'function') {
      console.error('Supabase client is not properly initialized. Check supabaseClient.js and Vercel environment variables.');
      setOverallStudentRank('Error');
      setBatchAverageCgpa('Error');
      return;
    }

    // Use cached data if available
    if (!allProcessedBatchData || requiredSemesterKeysGlobal.length === 0) {
        return;
    }

    const allStudentsFullProcessedData = allProcessedBatchData;
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
    } else {
      setOverallStudentRank('N/A (Missing Semesters)');
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

    // Set GPA Chart Data (Your GPA data will be updated by the separate useEffect)
    setGpaChartData({
      labels: allSemesterLabels,
      datasets: [
        {
          label: 'Your GPA',
          data: [], // Initial empty, will be populated by updateChartDataEffect
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
    });

    // Set CGPA Chart Data (Your CGPA data will be updated by the separate useEffect)
    setCgpaChartData({
      labels: allSemesterLabels,
      datasets: [
        {
          label: 'Your CGPA',
          data: [], // Initial empty, will be populated by updateChartDataEffect
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
    });

    console.timeEnd("calculateOverallRankAndChartAverages");
  }, [studentId, allProcessedBatchData, requiredSemesterKeysGlobal]);


  // Effect to trigger initial search on component mount with the default studentId
  useEffect(() => {
    if (studentId.trim().length === 10 && !studentData && !loading && !error) {
      fetchAndProcessStudentData();
    }
  }, [studentId, studentData, loading, error, fetchAndProcessStudentData]);

  // NEW useEffect: Load all batch data once on component mount
  useEffect(() => {
    const loadAllBatchData = async () => {
      if (supabase && typeof supabase.from === 'function' && !allProcessedBatchData) {
        setLoading(true); // Indicate loading for initial batch data
        try {
          const allExistingTablesMetadata = await fetchExistingTableNames();
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
  }, [supabase, allProcessedBatchData, processAllStudentsSemesterData]);

  // Trigger overall rank and chart average calculation after studentData is loaded
  // AND after all batch data is loaded
  useEffect(() => {
    if (studentData && allProcessedBatchData && requiredSemesterKeysGlobal.length > 0) {
        calculateOverallRankAndChartAverages();
    }
  }, [studentData, allProcessedBatchData, requiredSemesterKeysGlobal, calculateOverallRankAndChartAverages]);

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
    if (simulatedStudentData && requiredSemesterKeysGlobal.length > 0) {
        const allSemesterLabels = requiredSemesterKeysGlobal.sort((a, b) => {
            const [yearA, semA] = a.split('-').map(Number);
            const [yearB, semB] = b.split('-').map(Number);
            if (yearA !== yearB) return yearA - yearB;
            return semA - semB;
        }).map(key => {
            const [year, sem] = key.split('-').map(Number);
            return `${year} Year ${sem === 1 ? '1st' : '2nd'} Semester`;
        });

        const newStudentGpaHistory = allSemesterLabels.map(label => {
            const semesterKey = requiredSemesterKeysGlobal.find(key => {
                const [year, sem] = key.split('-').map(Number);
                return label === `${year} Year ${sem === 1 ? '1st' : '2nd'} Semester`;
            });
            // Use simulatedStudentData for chart data
            return simulatedStudentData.semesters[semesterKey]?.gpa || 0;
        });
        const newStudentCgpaHistory = allSemesterLabels.map(label => {
            const semesterKey = requiredSemesterKeysGlobal.find(key => {
                const [year, sem] = key.split('-').map(Number);
                return label === `${year} Year ${sem === 1 ? '1st' : '2nd'} Semester`;
            });
            // Use simulatedStudentData for chart data
            return simulatedStudentData.semesters[semesterKey]?.cgpa || 0;
        });

        // Update GpaChartData
        setGpaChartData(prevData => {
            if (!prevData) return null;
            return {
                ...prevData,
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
                datasets: prevData.datasets.map(dataset =>
                    dataset.label === 'Your CGPA' ? { ...dataset, data: newStudentCgpaHistory } : dataset
                )
            };
        });
    }
  }, [simulatedStudentData, requiredSemesterKeysGlobal, setGpaChartData, setCgpaChartData]);


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
      </div>

      {/* Consolidated Loading, Error, and Data Display */}
      {loading && !simulatedStudentData ? (
        <div className="bg-gray-800 p-6 rounded-lg shadow-md text-center text-blue-400">
          <p>Loading data...</p>
        </div>
      ) : error ? (
        <div className="bg-gray-800 p-6 rounded-lg shadow-md text-center text-red-500">
          <p>{error}</p>
        </div>
      ) : simulatedStudentData ? (
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
                                    <th className="py-2 px-3 border-b border-gray-600">Regular Grade</th>
                                    <th className="py-2 px-3 border-b border-gray-600">Expected or Improvement Grade</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sem.courseDetails.map((course, idx) => (
                                    <tr key={idx} className="hover:bg-gray-600">
                                      <td className="py-2 px-3 border-b border-gray-600">{course.courseCode}</td>
                                      <td className="py-2 px-3 border-b border-gray-600">
                                        <span className="font-bold">{course.originalGradeLetter} ({getGradePoint(course.originalGradeLetter).toFixed(2)})</span>
                                      </td>
                                      <td className="py-2 px-3 border-b border-gray-600">
                                        {/* Display actual applied improvement grade or input for expected */}
                                        {course.improvementApplied ? (
                                          <span className="font-bold text-green-400">{course.gradeLetter} ({course.gradePoint.toFixed(2)})</span>
                                        ) : (course.hasImprovementOpportunity || course.gradeLetter === 'F') ? (
                                          <div className="flex items-center">
                                            {course.gradeLetter === 'F' && (
                                              // Enhanced 'F!' warning
                                              <span className="bg-red-700 text-white px-3 py-1.5 rounded-md mr-2 font-bold text-xl shadow-lg">F!</span>
                                            )}
                                            <input
                                              type="text"
                                              className="p-1 w-24 border border-gray-600 rounded-md bg-gray-800 text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                                              value={expectedGrades[`${semesterKey}-${course.courseCode}`] || ''}
                                              onChange={(e) => handleExpectedGradeChange(semesterKey, course.courseCode, e.target.value)}
                                              placeholder={course.originalGradeLetter}
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
