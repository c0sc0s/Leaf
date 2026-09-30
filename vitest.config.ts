import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: [
            'tests/unit/**/*.test.{ts,tsx}',
            'packages/*/tests/unit/**/*.test.{ts,tsx}',
            'plugins/*/tests/unit/**/*.test.{ts,tsx}',
          ],
        },
      },
      {
        test: {
          name: 'integration',
          include: [
            'tests/integration/**/*.test.{ts,tsx}',
            'plugins/*/tests/integration/**/*.test.{ts,tsx}',
          ],
        },
      },
    ],
  },
});
