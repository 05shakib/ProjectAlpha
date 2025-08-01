import React from 'react';

export default function DeansLists({ deansHonoursList, deansMeritList, yearOf42Exam }) {
  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-md mb-8">
      <h2 className="text-2xl font-semibold mb-4 text-center text-blue-400">Dean's Lists</h2>

      {/* Dean's Honours List */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-3 text-white">
          Dean's Honours List (CGPA {'>='} 3.850)
        </h3>
        {deansHonoursList && deansHonoursList.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-gray-700 rounded-lg text-left text-white">
              <thead>
                <tr>
                  <th className="py-3 px-4 border-b border-gray-600">Student Name</th>
                  <th className="py-3 px-4 border-b border-gray-600">
                    {yearOf42Exam !== 'Future' ? 'CGPA' : 'Current CGPA / Required GPA in Remaining Semesters'}
                  </th>
                  <th className="py-3 px-4 border-b border-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {deansHonoursList.map((student) => (
                  <tr key={student.id} className="border-b border-gray-600 hover:bg-gray-600">
                    <td className="py-2 px-4">{student.name}</td>
                    <td className="py-2 px-4">
                      {student.type === 'completed'
                        ? (typeof student.cgpa === 'number' && !isNaN(student.cgpa) && isFinite(student.cgpa) ? student.cgpa.toFixed(3) : 'N/A')
                        : `Current: ${(typeof student.currentOverallCgpa === 'number' && !isNaN(student.currentOverallCgpa) && isFinite(student.currentOverallCgpa) ? student.currentOverallCgpa.toFixed(3) : 'N/A')}, Required: ${(typeof student.requiredCgpa === 'number' && !isNaN(student.requiredCgpa) && isFinite(student.requiredCgpa) ? student.requiredCgpa.toFixed(3) : 'N/A')}`}
                    </td>
                    <td className="py-2 px-4">{student.type === 'completed' ? 'Completed' : 'Potential'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-gray-400">
            {yearOf42Exam !== 'Future'
              ? 'No students qualified for Dean\'s Honours List yet.'
              : 'No potential candidates for Dean\'s Honours List yet.'}
          </p>
        )}
      </div>

      {/* Dean's Merit List */}
      <div>
        <h3 className="text-xl font-semibold mb-3 text-white">
          Dean's Merit List (4.000 CGPA in any semester)
        </h3>
        {deansMeritList && deansMeritList.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-gray-700 rounded-lg text-left text-white">
              <thead>
                <tr>
                  <th className="py-3 px-4 border-b border-gray-600">Student Name</th>
                  <th className="py-3 px-4 border-b border-gray-600">Semester(s) Achieved</th>
                </tr>
              </thead>
              <tbody>
                {deansMeritList.map((student) => (
                  <tr key={student.id} className="border-b border-gray-600 hover:bg-gray-600">
                    <td className="py-2 px-4">{student.name}</td>
                    <td className="py-2 px-4">
                      {student.semesters.map(sem => sem.semesterDisplayName).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-gray-400">No students qualified for Dean's Merit List yet.</p>
        )}
      </div>
    </div>
  );
}
