import { defineConfig } from 'bun:test';

export default defineConfig({
  // Test file patterns
  testMatch: [
    'tests/**/*.test.ts',
    'tests/**/*.test.js',
  ],
  
  // Test environment setup
  preload: ['./tests/setup.ts'],
  
  // Test timeout (30 seconds)
  timeout: 30000,
  
  // Coverage configuration
  coverage: {
    enabled: true,
    reporter: ['text', 'html', 'json'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'tests/**',
      '**/*.test.ts',
      '**/*.test.js',
    ],
    threshold: {
      statements: 80,
      functions: 80,
      branches: 70,
      lines: 80,
    },
  },
  
  // Test reporting
  verbose: process.env.VERBOSE === 'true',
  
  // Parallel execution
  parallel: true,
  
  // Retry failed tests
  retry: 1,
});
