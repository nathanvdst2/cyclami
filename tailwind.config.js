/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // turquoise de la marque, légèrement foncé : texte blanc lisible (contraste ≥ 4,5, normes d'accessibilité)
        teal: { 500: '#0f766e', 600: '#115e59', 700: '#134e4a' },
      },
    },
  },
  plugins: [],
};
