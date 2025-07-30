import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function ResultTrendChart({ labels, datasets, title, yAxisLabel }) {
  // Log props received by the chart component for debugging
  console.log('ResultTrendChart received props:', { labels, datasets, title, yAxisLabel });

  const data = {
    labels: labels,
    datasets: datasets.map(dataset => ({
      ...dataset,
      // Ensure point styles are visible
      pointRadius: 5,
      pointBackgroundColor: dataset.borderColor, // Use dataset's border color for point fill
      pointBorderColor: '#000000', // Black border for points
      pointBorderWidth: 2,
      hoverRadius: 7,
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false, // Allows chart to resize freely
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#000000', // Black color for legend labels
          font: {
            size: 14, // Increased font size for better visibility
            weight: 'bold', // Made font bold
          },
        },
      },
      title: {
        display: true, // Ensure chart title is displayed
        text: title,
        color: '#000000', // Black color for chart title
        font: {
          size: 18, // Increased font size for chart title
          weight: 'bold', // Made font bold
        },
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += context.parsed.y.toFixed(2); // Format to 2 decimal places
            }
            return label;
          }
        },
        titleColor: '#000000', // Black color for tooltip title
        bodyColor: '#000000', // Black color for tooltip body text
        backgroundColor: 'rgba(255, 255, 255, 0.9)', // Lighter tooltip background
        borderColor: '#000000', // Black border for tooltip
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        title: {
          display: true, // Ensure X-axis title is displayed
          text: 'Semester',
          color: '#000000', // Black color for X-axis title
          font: {
            size: 14, // Increased font size
            weight: 'bold', // Made font bold
          },
        },
        ticks: {
          color: '#000000', // Black color for X-axis labels
          font: {
            size: 12, // Increased font size
          },
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)', // Light grid lines for visibility on light background
        },
      },
      y: {
        title: {
          display: true, // Ensure Y-axis title is displayed
          text: yAxisLabel, // Use the dynamic yAxisLabel prop
          color: '#000000', // Black color for Y-axis title
          font: {
            size: 14, // Increased font size
            weight: 'bold', // Made font bold
          },
        },
        ticks: {
          color: '#000000', // Black color for Y-axis labels
          font: {
            size: 12, // Increased font size
          },
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)', // Light grid lines for visibility on light background
        },
        min: 0,
        max: 4, // Assuming GPA/CGPA range from 0 to 4
      },
    },
  };

  // Log the final options object for debugging
  console.log('ResultTrendChart options being used:', options);

  return (
    <div style={{ height: '400px', width: '100%' }}> {/* Set a fixed height for the chart container */}
      <Line data={data} options={options} />
    </div>
  );
}
