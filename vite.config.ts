import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works on GitHub Pages under /blockyard/ and when served by the Blockyard server.
// In development, API, MCP and published-site requests go to the server on port 8787.
const api = 'http://localhost:8787';
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { proxy: { '/api': api, '/sites': api, '/mcp': api } },
});
