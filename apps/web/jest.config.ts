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
    'src/features/**/*.{ts,tsx}',
    'src/components/ui/**/*.{ts,tsx}',
    'src/lib/**/*.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.server.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
};
export default createJestConfig(config);
