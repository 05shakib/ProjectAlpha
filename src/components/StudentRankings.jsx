import React from 'react';

export default function StudentRankings({ topStudents, nearbyStudents, currentStudentId }) {
  return (
    <>
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
                <th className="py-3 px-4 border-b border-gray-600">Std. Dev.</th>
              </tr>
            </thead>
// For the Top Students table mapping:
			<tbody>
				{topStudents.map((student) => (
					<tr key={student.studentId} className="hover:bg-gray-600">
						<td className="py-2 px-4 border-b border-gray-600">{student.rank}</td>
						<td className="py-2 px-4 border-b border-gray-600">{student.studentId}</td>
						<td className="py-2 px-4 border-b border-gray-600">{student.name}</td>
						<td className="py-2 px-4 border-b border-gray-600">{student.cgpa || student.overallCgpa}</td>
						<td className="py-2 px-4 border-b border-gray-600">{student.stdDev || 'N/A'}</td>
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
                  <th className="py-3 px-4 border-b border-gray-600">Std. Dev.</th>
                </tr>
              </thead>
// For the Nearby Students table mapping:
				<tbody>
					{nearbyStudents.map((student) => (
						<tr key={student.studentId} className={`hover:bg-gray-600 ${String(student.studentId) === String(currentStudentId) ? 'bg-blue-700 font-bold' : ''}`}>
						  <td className="py-2 px-4 border-b border-gray-600">{student.rank}</td>
						  <td className="py-2 px-4 border-b border-gray-600">{student.studentId}</td>
						  <td className="py-2 px-4 border-b border-gray-600">{student.name}</td>
						  <td className="py-2 px-4 border-b border-gray-600">{student.cgpa || student.overallCgpa}</td>
						  <td className="py-2 px-4 border-b border-gray-600">{student.stdDev || 'N/A'}</td>
						</tr>
					))}
				</tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
