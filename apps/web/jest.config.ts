import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });
const config: Config = {
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  clearMocks: true,
  restoreMocks: true,
  watchman: false,
  coverageProvider: 'v8',
  collectCoverageFrom: [
    'src/features/photos/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/features/photos/photo-api.ts',
    '!src/features/photos/photo-layout.tsx',
  ],
  coverageDirectory: '<rootDir>/coverage',
};
export default createJestConfig(config);
