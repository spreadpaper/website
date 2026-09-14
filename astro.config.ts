import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

// Tailwind 4 ships as a Vite plugin; `@astrojs/tailwind` is deprecated and v3 only.
export default defineConfig({
  site: 'https://spreadpaper.app',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
})
