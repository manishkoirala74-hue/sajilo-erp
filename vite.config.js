import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({

  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@tanstack/react-query')) return 'vendor-query';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('jspdf') || id.includes('jspdf-autotable') || id.includes('exceljs') || id.includes('@react-pdf')) return 'vendor-pdf';
            if (id.includes('recharts')) return 'vendor-charts';
            return 'vendor'; // Fallback for all other node_modules
          }
          if (id.includes('/src/pages/sales/')) return 'domain-sales';
          if (id.includes('/src/pages/purchase/')) return 'domain-purchase';
          if (id.includes('/src/pages/inventory/')) return 'domain-inventory';
          if (id.includes('/src/pages/accounting/')) return 'domain-accounting';
          if (id.includes('/src/pages/settings/')) return 'domain-settings';
          if (id.includes('/src/pages/reports/')) return 'domain-reports';
          if (id.includes('/src/pages/partners/')) return 'domain-partners';
        }
      }
    }
  }
});