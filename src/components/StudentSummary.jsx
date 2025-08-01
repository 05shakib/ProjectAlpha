import React from 'react';

export default function StudentSummary({ studentData, overallStudentRank, batchAverageCgpa }) {
  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-md mb-8">
      <h2 className="text-2xl font-semibold mb-4 text-center">
        Results for Student ID: {studentData?.id || 'N/A'} ({studentData?.name || 'N/A'})
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gray-700 p-4 rounded-md text-center">
          <p className="text-lg font-medium">Overall CGPA:</p>
          <p className="text-4xl font-bold text-green-400">{studentData?.overallCgpa || 'N/A'}</p>
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
    </div>
  );
}
