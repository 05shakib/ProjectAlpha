// File: components/ResultTrendChart.jsx
import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { supabase } from '../lib/supabaseClient';

const ResultTrendChart = ({ studentId }) => {
  const [labels, setLabels] = useState([]);
  const [studentGpas, setStudentGpas] = useState([]);
  const [topperGpas, setTopperGpas] = useState([]);
  const [averageGpas, setAverageGpas] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      const semesterList = [
        '1st Year 1st Semester 2021',
        '1st Year 2nd Semester 2021',
        '2nd Year 1st Semester 2022',
        '2nd Year 2nd Semester 2022',
        '3rd Year 1st Semester 2023'
      ];

      let studentGpaSeries = [];
      let topperSeries = [];
      let avgSeries = [];

      for (const semester of semesterList) {
        const { data, error } = await supabase
          .from('Results')
          .select('*')
          .eq('semester', semester);

        if (error || !data.length) {
          studentGpaSeries.push(null);
          topperSeries.push(null);
          avgSeries.push(null);
          continue;
        }

        const gpas = data.map(d => d.gpa);
        const avg = gpas.reduce((sum, val) => sum + val, 0) / gpas.length;
        const topper = Math.max(...gpas);
        const student = data.find(d => d.roll_no === studentId)?.gpa || null;

        avgSeries.push(parseFloat(avg.toFixed(2)));
        topperSeries.push(parseFloat(topper.toFixed(2)));
        studentGpaSeries.push(student);
      }

      setLabels(semesterList);
      setStudentGpas(studentGpaSeries);
      setTopperGpas(topperSeries);
      setAverageGpas(avgSeries);
    };

    if (studentId) fetchData();
  }, [studentId]);

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Your CGPA',
        data: studentGpas,
        borderColor: 'black',
        backgroundColor: 'rgba(0,0,0,0.1)',
        tension: 0.3
      },
      {
        label: 'Topper CGPA',
        data: topperGpas,
        borderColor: 'green',
        backgroundColor: 'rgba(0,128,0,0.1)',
        tension: 0.3
      },
      {
        label: 'Batch Average',
        data: averageGpas,
        borderColor: 'orange',
        backgroundColor: 'rgba(255,165,0,0.1)',
        tension: 0.3
      }
    ]
  };

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-2">CGPA vs Topper vs Batch Average</h3>
      <Line data={chartData} options={{ responsive: true, scales: { y: { max: 4.0 } } }} />
    </div>
  );
};

export default ResultTrendChart;
