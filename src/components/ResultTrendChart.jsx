import { useRef, useEffect } from 'react';
import { Chart } from 'chart.js'; // Import Chart directly from 'chart.js'

export default function ResultTrendChart({ labels, datasets, title }) {
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null); // Use a ref to store chart instance

  useEffect(() => {
    const ctx = chartRef.current;
    if (!ctx) return;

    // Destroy existing chart instance if it exists
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    // Set global default font and color for this chart if specific to this component,
    // otherwise, these can be managed globally in chartSetup.js or a theme.
    Chart.defaults.color = 'white';
    Chart.defaults.font.family = 'Arial'; // Example: Set a specific font
    Chart.defaults.font.size = 14; // Example: Set a specific font size

    chartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
            color: 'white',
            font: {
              size: 16,
            },
          },
          legend: {
            labels: {
              color: 'white', // Legend label color
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Semester',
              color: 'white',
            },
            ticks: {
              color: 'white', // X-axis tick labels color
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)', // Grid line color
            },
          },
          y: {
            title: {
              display: true,
              text: 'GPA',
              color: 'white',
            },
            min: 0,
            max: 4.00, // Fixed max GPA
            ticks: {
              color: 'white', // Y-axis tick labels color
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)', // Grid line color
            },
          },
        },
      },
    });

    // Cleanup function to destroy chart on unmount
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [labels, datasets, title]);

  return <canvas ref={chartRef} />;
}