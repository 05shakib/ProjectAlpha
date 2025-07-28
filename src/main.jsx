import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App.jsx';   // <-- Changed here: named import instead of default

createRoot(document.getElementById('root')).render(
  <App />
);
