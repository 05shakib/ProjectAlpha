export default function Projects() {
  return (
    <section>
      <h1 className="text-3xl font-bold mb-4">My Projects</h1>
      <ul className="list-disc pl-6 space-y-2">
        <li>
          <strong>ProjectAlpha</strong>: A React + Vite + Tailwind + Supabase web app for university result analysis with dynamic charts and analytics.
        </li>
        <li>
          <strong>Data Scraper & Analyzer</strong>: Tools for scraping exam results, OCR processing, and generating analytical reports.
        </li>
        <li>
          <strong>Other Academic & Tech Projects</strong>: Various initiatives involving marketing research, Python data analytics, and chatbot development.
        </li>
      </ul>
    </section>
  );
}
