import { useRef, useEffect } from 'react';
import Chart from 'chart.js/auto';

export default function ResultTrendChart({ labels, datasets, title }) {
  const chartRef = useRef(null);

  useEffect(() => {
    const ctx = chartRef.current;
    if (!ctx) return;

    const chartInstance = new Chart(ctx, {
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
              color: 'white',
            },
          },
        },
        scales: {
          x: {
            ticks: { color: 'white' },
          },
          y: {
            ticks: { color: 'white' },
            beginAtZero: true,
            max: 4,
          },
        },
      },
    });

    return () => {
      chartInstance.destroy();
    };
  }, [labels, datasets]);

  return (
    <div className="w-full my-6">
      <canvas ref={chartRef} />
    </div>
  );
}
