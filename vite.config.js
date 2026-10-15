import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // adresses partagées (/b/…, /g/…) et pages en /nl, /en : les fichiers sont toujours servis depuis la racine
  base: '/',
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
