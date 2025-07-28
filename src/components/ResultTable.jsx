export default function ResultTable() {
  // Placeholder for data; will connect Supabase later
  const dummyData = [
    { id: 'S001', name: 'Shakib', course: 'Marketing 301', gpa: 3.75 },
    { id: 'S002', name: 'Rahim', course: 'Finance 302', gpa: 3.50 }
  ]

  return (
    <div className="overflow-x-auto bg-white rounded shadow">
      <table className="min-w-full table-auto">
        <thead>
          <tr className="bg-gray-200 text-left">
            <th className="px-4 py-2">ID</th>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Course</th>
            <th className="px-4 py-2">GPA</th>
          </tr>
        </thead>
        <tbody>
          {dummyData.map((s, i) => (
            <tr key={i} className="border-t">
              <td className="px-4 py-2">{s.id}</td>
              <td className="px-4 py-2">{s.name}</td>
              <td className="px-4 py-2">{s.course}</td>
              <td className="px-4 py-2">{s.gpa}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
