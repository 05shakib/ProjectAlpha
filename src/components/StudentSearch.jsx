import { useState } from "react";
import { supabase } from "../supabaseClient";
import ChartRenderer from "./ChartRenderer";

export default function StudentSearch() {
  const [studentId, setStudentId] = useState("");
  const [resultData, setResultData] = useState(null);

  const handleSearch = async () => {
    if (!studentId) return;

    const { data, error } = await supabase
      .from("your_table_name") // example: 2122R
      .select("*")
      .eq("Roll", studentId);

    if (error || !data || data.length === 0) {
      setResultData(null);
    } else {
      setResultData(data);
    }
  };

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Enter Student ID"
        value={studentId}
        onChange={(e) => setStudentId(e.target.value)}
        className="border px-4 py-2 rounded"
      />
      <button
        onClick={handleSearch}
        className="bg-green-600 text-white px-4 py-2 rounded"
      >
        Search
      </button>

      {resultData && (
        <div>
          <ChartRenderer data={resultData} title="Student GPA Trend" />
        </div>
      )}
    </div>
  );
}
