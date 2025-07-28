import StudentSearch from "./StudentSearch";
import CourseSearch from "./CourseSearch";

export default function ResultAnalysis() {
  return (
    <section id="analysis" className="space-y-6">
      <h2 className="text-2xl font-semibold text-blue-700">Result Analysis</h2>
      <StudentSearch />
      <CourseSearch />
    </section>
  );
}
