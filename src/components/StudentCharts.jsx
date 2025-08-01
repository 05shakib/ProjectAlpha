import React from 'react';
import ResultTrendChart from './ResultTrendChart'; // Assuming ResultTrendChart is in the same directory or accessible

export default function StudentCharts({ gpaChartData, cgpaChartData }) {
  return (
    <>
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
    </>
  );
}
