import React from 'react';
import { getGradePoint } from '../lib/dataUtils'; // Ensure this path is correct

export default function SemesterDetails({
  simulatedStudentData,
  expandedSemester,
  toggleSemesterExpansion,
  expectedGrades,
  handleExpectedGradeChange,
}) {
  return (
    <>
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
            {simulatedStudentData?.semesters && Object.entries(simulatedStudentData.semesters).map(([semesterKey, sem]) => (
              <React.Fragment key={semesterKey}>
                <tr
                  className="hover:bg-gray-600 cursor-pointer"
                  onClick={() => toggleSemesterExpansion(semesterKey)}
                >
                  <td className="py-2 px-4 border-b border-gray-600">{sem.semesterDisplayName}</td>
                  <td className="py-2 px-4 border-b border-gray-600">{sem.gpa.toFixed(3)}</td>
                  <td className="py-2 px-4 border-b border-gray-600">{sem.ygpa.toFixed(3)}</td>
                  <td className="py-2 px-4 border-b border-gray-600">{sem.cgpa.toFixed(3)}</td>
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
                                <th className="py-2 px-3 border-b border-gray-600">Expected or Target Grade</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sem.courseDetails.map((course, idx) => (
                                <tr key={idx} className="hover:bg-gray-600">
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
                                          className="p-1 w-24 border border-gray-600 rounded-md bg-gray-800 text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                                          value={expectedGrades[`${semesterKey}-${course.courseCode}`] || ''}
                                          onChange={(e) => handleExpectedGradeChange(semesterKey, course.courseCode, e.target.value)}
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
  );
}
