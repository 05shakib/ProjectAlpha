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

// Helper to normalize CGPA values safely for ranking comparisons
const getRankScore = (student, scoreKey = 'overallCgpa') => {
  const score = Number(student?.[scoreKey]);
  return Number.isFinite(score) ? score : 0;
};

// Helper to keep ordering stable when CGPA is tied
const compareStudentIdentity = (a, b) => {
  const aId = String(a?.id ?? a?.studentId ?? '');
  const bId = String(b?.id ?? b?.studentId ?? '');
  return aId.localeCompare(bId, undefined, { numeric: true, sensitivity: 'base' });
};

/**
 * Applies Standard Competition Ranking.
 * Example: CGPAs [4.00, 3.90, 3.90, 3.80] => ranks [1, 2, 2, 4].
 *
 * The original input array and objects are not mutated.
 *
 * @param {Array<object>} students Array of student objects.
 * @param {string} [scoreKey='overallCgpa'] Numeric field used for ranking.
 * @returns {Array<object>} Sorted copy of students with a rank field added.
 */
export const calculateStandardCompetitionRanks = (students = [], scoreKey = 'overallCgpa') => {
  const sortedStudents = [...students]
    .filter(Boolean)
    .sort((a, b) => {
      const scoreDifference = getRankScore(b, scoreKey) - getRankScore(a, scoreKey);
      return scoreDifference !== 0 ? scoreDifference : compareStudentIdentity(a, b);
    });

  let currentRank = 0;
  let previousScore = null;

  return sortedStudents.map((student, index) => {
    const currentScore = getRankScore(student, scoreKey);

    if (index === 0) {
      currentRank = 1;
    } else if (currentScore !== previousScore) {
      currentRank = index + 1;
    }

    previousScore = currentScore;

    return {
      ...student,
      rank: currentRank
    };
  });
};

/**
 * Returns the top N students, expanding beyond N when the boundary student is tied.
 * Example: if the 5th and 6th students share the same CGPA, both are returned.
 *
 * @param {Array<object>} rankedStudents Students already ranked/sorted.
 * @param {number} [limit=5] Base limit before tie expansion.
 * @param {string} [scoreKey='overallCgpa'] Numeric field used for tie comparison.
 * @returns {Array<object>}
 */
export const getTopStudentsWithTieExpansion = (rankedStudents = [], limit = 5, scoreKey = 'overallCgpa') => {
  if (!Array.isArray(rankedStudents) || rankedStudents.length <= limit) {
    return rankedStudents || [];
  }

  const boundaryScore = getRankScore(rankedStudents[limit - 1], scoreKey);
  let endIndex = limit - 1;

  while (
    endIndex + 1 < rankedStudents.length &&
    getRankScore(rankedStudents[endIndex + 1], scoreKey) === boundaryScore
  ) {
    endIndex += 1;
  }

  return rankedStudents.slice(0, endIndex + 1);
};

/**
 * Returns a current-student ranking window, expanding the top/bottom edges when
 * the edge student is tied with students just outside the normal display range.
 *
 * @param {Array<object>} rankedStudents Students already ranked/sorted.
 * @param {string|number} currentStudentId Current student's roll/student ID.
 * @param {number} [above=5] Number of rows above current student before tie expansion.
 * @param {number} [below=5] Number of rows below current student before tie expansion.
 * @param {string} [scoreKey='overallCgpa'] Numeric field used for tie comparison.
 * @returns {Array<object>}
 */
export const getStudentsAroundRankWithTieExpansion = (
  rankedStudents = [],
  currentStudentId,
  above = 5,
  below = 5,
  scoreKey = 'overallCgpa'
) => {
  if (!Array.isArray(rankedStudents) || rankedStudents.length === 0) {
    return [];
  }

  const normalizedCurrentStudentId = String(currentStudentId ?? '');
  const currentIndex = rankedStudents.findIndex(student => {
    const possibleId = String(student?.id ?? student?.studentId ?? '');
    return possibleId === normalizedCurrentStudentId;
  });

  if (currentIndex === -1) {
    return [];
  }

  let startIndex = Math.max(0, currentIndex - above);
  let endIndex = Math.min(rankedStudents.length - 1, currentIndex + below);

  const topBoundaryScore = getRankScore(rankedStudents[startIndex], scoreKey);
  while (
    startIndex > 0 &&
    getRankScore(rankedStudents[startIndex - 1], scoreKey) === topBoundaryScore
  ) {
    startIndex -= 1;
  }

  const bottomBoundaryScore = getRankScore(rankedStudents[endIndex], scoreKey);
  while (
    endIndex + 1 < rankedStudents.length &&
    getRankScore(rankedStudents[endIndex + 1], scoreKey) === bottomBoundaryScore
  ) {
    endIndex += 1;
  }

  return rankedStudents.slice(startIndex, endIndex + 1);
};

