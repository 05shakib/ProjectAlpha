// src/lib/dataUtils.js
import { supabase } from './supabaseClient'; // Import supabase client here

// Grade to GPA conversion scheme
export const gradeToGpa = {
  'A+': 4.00, 'A': 3.75, 'A-': 3.50,
  'B+': 3.25, 'B': 3.00, 'B-': 2.75,
  'C+': 2.50, 'C': 2.25, 'D': 2.00,
  'F': 0.00
};

// All courses are 3 credits each, as per your specification
export const COURSE_CREDITS = 3;

// 5 courses per semester, as per your specification
export const COURSES_PER_SEMESTER = 5;

// Helper function to get subject codes for a given academic year and semester
export const getSubjectCodesForAcademicSemester = (academicYear, academicSemesterNum) => {
  const baseCode = `${academicYear}${academicSemesterNum === 1 ? '0' : '1'}`;
  const codes = [];
  for (let i = 1; i <= COURSES_PER_SEMESTER; i++) {
    codes.push(`${baseCode}${i}`);
  }
  return codes;
};

/**
 * Dynamically fetches a list of existing table names from the metadata table.
 * This is the preferred method over generating all possible names.
 *
 * @param {number} [academicYear] Optional: Filter by academic year.
 * @param {number} [academicSemester] Optional: Filter by academic semester (1 or 2).
 * @param {string} [resultType] Optional: Filter by result type ('R' or 'I').
 * @returns {Promise<string[]>} A promise that resolves to an array of existing table names.
 */
export const fetchExistingTableNames = async (academicYear = null, academicSemester = null, resultType = null) => {
  let query = supabase.from('result_tables_metadata').select('table_name, academic_year, academic_semester, exam_year, result_type');

  if (academicYear !== null) {
    query = query.eq('academic_year', academicYear);
  }
  if (academicSemester !== null) {
    query = query.eq('academic_semester', academicSemester);
  }
  if (resultType !== null) {
    query = query.eq('result_type', resultType);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching table names from metadata:', error);
    return [];
  }

  // Return the full metadata objects, as we'll need year, semester, type later
  return data || [];
};


// Helper to determine the academic year and semester from a course code
export const parseCourseCode = (courseCode) => {
  if (typeof courseCode !== 'string' || courseCode.length !== 3) {
    return null;
  }
  const academicYear = parseInt(courseCode.charAt(0), 10);
  const semesterDigit = parseInt(courseCode.charAt(1), 10); // 0 for 1st sem, 1 for 2nd sem
  const courseNumber = parseInt(courseCode.charAt(2), 10);

  if (isNaN(academicYear) || isNaN(semesterDigit) || isNaN(courseNumber)) {
    return null;
  }

  const academicSemesterNum = semesterDigit === 0 ? 1 : 2; // Convert 0/1 to 1st/2nd semester

  return { academicYear, academicSemesterNum, courseNumber };
};

// Helper to get the grade point from a letter grade
export const getGradePoint = (gradeLetter) => gradeToGpa[gradeLetter] || 0.00;

/**
 * Calculates Standard Competition Rankings (1, 2, 2, 4) for a cohort.
 * @param {Array} students - Array of student data objects.
 * @param {string} gpaKey - The object key containing the CGPA (default: 'overallCgpa').
 * @returns {Array} - New array sorted by CGPA descending with a 'rank' property added.
 */
export const calculateStandardRankings = (students, gpaKey = 'overallCgpa') => {
  if (!students || students.length === 0) return [];

  // Create a shallow copy and sort by CGPA descending
  const sorted = [...students].sort((a, b) => parseFloat(b[gpaKey]) - parseFloat(a[gpaKey]));

  let currentRank = 1;
  let previousCgpa = null;

  return sorted.map((student, index) => {
    const currentCgpa = parseFloat(student[gpaKey]);

    // If CGPA differs from the peer above, the rank jumps to the 1-based array index position
    if (currentCgpa !== previousCgpa) {
      currentRank = index + 1;
    }
    previousCgpa = currentCgpa;

    return {
      ...student,
      rank: currentRank,
      // Normalize the ID property so both Top & Nearby tables can render without key errors
      id: student.id || student.studentId || student.roll,
      studentId: student.studentId || student.id || student.roll
    };
  });
};

/**
 * Fetches top students, dynamically expanding past the limit if edge ties exist.
 */
export const getTopStudentsWithTies = (rankedStudents, targetLimit = 5) => {
  if (!rankedStudents || rankedStudents.length === 0) return [];
  if (rankedStudents.length <= targetLimit) return rankedStudents;

  // Find the rank value at the exact cutoff index (e.g., index 4 for Top 5)
  const edgeIndex = targetLimit - 1;
  const edgeRank = rankedStudents[edgeIndex].rank;

  // Filter to keep everyone who matches or beats this rank
  return rankedStudents.filter(student => student.rank <= edgeRank);
};

/**
 * Fetches contextual peer windows, naturally absorbing multi-student boundary ties.
 */
export const getNearbyStudentsWithTies = (rankedStudents, currentStudentId, range = 5) => {
  if (!rankedStudents || rankedStudents.length === 0) return [];

  const centerStudent = rankedStudents.find(
    s => String(s.studentId) === String(currentStudentId)
  );

  if (!centerStudent) return [];

  const centerRank = centerStudent.rank;
  const minRank = Math.max(1, centerRank - range);
  const maxRank = centerRank + range;

  return rankedStudents.filter(student => student.rank >= minRank && student.rank <= maxRank);
};