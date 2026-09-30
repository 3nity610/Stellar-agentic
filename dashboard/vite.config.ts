import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';

// Plugin to enforce bundle size budget
function bundleSizeBudget(): PluginOption {
  return {
    name: 'bundle-size-budget',
    enforce: 'post',
    closeBundle() {
      console.log('\n✓ Bundle size budget check complete');
    },
    generateBundle(_, bundle) {
      const appChunkLimit = 500 * 1024; // 500 KB limit for app code chunks
      const vendorChunkLimit = 1000 * 1024; // 1 MB limit for vendor chunks (Stellar SDK is large)
      const violations: string[] = [];

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && 'code' in chunk) {
          const size = chunk.code.length;
          // Vendor chunks (stellar-sdk, recharts, react-vendor, etc.) have higher limit
          const isVendorChunk = fileName.includes('stellar-sdk') || 
                                fileName.includes('stellaragent-core') ||
                                fileName.includes('vendor') ||
                                fileName.includes('react-vendor');
          const limit = isVendorChunk ? vendorChunkLimit : appChunkLimit;
          const limitLabel = isVendorChunk ? '1 MB (vendor)' : '500 KB (app)';
          
          if (size > limit) {
            violations.push(
              `${fileName}: ${(size / 1024).toFixed(2)} KB (exceeds ${limitLabel})`
            );
          }
        }
      }

      if (violations.length > 0) {
        const message = `❌ Bundle size budget exceeded!\n\nThe following chunks exceed their limits:\n${violations.map(v => `  - ${v}`).join('\n')}\n\nNote:\n- App code chunks must be < 500 KB\n- Vendor chunks must be < 1 MB\n- Stellar SDK is inherently large but lazy-loaded\n`;
        
        if (process.env.CI) {
          throw new Error(message);
        } else {
          console.warn('\n' + message);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), bundleSizeBudget()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Extract specific large libraries into separate chunks
          if (id.includes('node_modules')) {
            // Recharts and its dependencies
            if (id.includes('recharts')) {
              return 'recharts';
            }
            // Stellar SDK (if imported separately from core)
            if (id.includes('@stellar/stellar-sdk')) {
              return 'stellar-sdk';
            }
            // StellarAgent core (contains Stellar SDK)
            if (id.includes('@stellaragent/core')) {
              return 'stellaragent-core';
            }
            // React ecosystem
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor';
            }
            // Animation libraries
            if (id.includes('framer-motion')) {
              return 'animation';
            }
            // UI utilities (smaller bundle)
            if (id.includes('lucide-react') || id.includes('clsx') || id.includes('tailwind-merge')) {
              return 'ui-utils';
            }
            // Other node_modules in a common vendor chunk
            return 'vendor';
          }
        },
      },
    },
    // Increased from 500 KB to 1000 KB because:
    // 1. Stellar SDK is inherently large (~900 KB) but properly code-split
    // 2. It only loads when users visit the Payments page (lazy-loaded)
    // 3. All application code chunks remain under 500 KB
    // 4. Custom bundleSizeBudget plugin enforces stricter per-chunk-type limits
    chunkSizeWarningLimit: 1000,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
