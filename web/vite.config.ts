import path from "path"
import { readFileSync } from "node:fs"
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { seoShells } from './seo-shells-plugin'

const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf-8"),
) as { version: string }

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_')
  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    // seoShells writes the per-route SEO HTML and sitemap.xml at build time (DEC-008).
    plugins: [react(), tailwindcss(), seoShells({ gscToken: env.VITE_GSC_VERIFICATION })],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }
})
