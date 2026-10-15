import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Chemins relatifs : le build fonctionne sur Vercel, Netlify ou GitHub Pages sans réglage.
  base: '/', // adresses partagées (/b/…, /a/…) : les fichiers sont toujours à la racine
  build: {
    rollupOptions: {
      output: {
        // bibliothèques à part : elles changent rarement et restent en cache entre deux mises à jour du site
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
