import { Line } from "react-chartjs-2";

export default function ChartRenderer({ data, title }) {
  const chartData = {
    labels: data.map((d) => d.Semester),
    datasets: [
      {
        label: "GPA",
        data: data.map((d) => d.GPA),
        backgroundColor: "rgba(0, 123, 255, 0.5)",
        borderColor: "blue",
        fill: true,
      },
    ],
  };

  return (
    <div className="chart-container my-4">
      <h3 className="text-xl font-semibold">{title}</h3>
      <Line data={chartData} />
    </div>
  );
}
