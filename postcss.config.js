import tailwindcss from '@tailwindcss/postcss'; // Correct import for v4
import autoprefixer from 'autoprefixer';

export default {
  plugins: [
    tailwindcss, // Use the imported plugin
    autoprefixer,
  ],
};