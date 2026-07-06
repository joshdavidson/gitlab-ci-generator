import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// base: './' keeps asset URLs relative so the built site works at any path
// (GitLab Pages project subpath, a plain file:// open, or an nginx root).
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
