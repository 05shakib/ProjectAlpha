// src/lib/chartSetup.js
import { Chart, registerables } from 'chart.js';

// Register all available Chart.js components (charts, scales, elements, etc.)
// This is crucial for Chart.js to know how to render 'line' charts, 'bar' charts, etc.
Chart.register(...registerables);

// You can optionally register specific components if you only need a few,
// but registerables covers all common use cases.
// Example for specific registration:
// import { LineController, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
// Chart.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

console.log('Chart.js registered all components.');
