import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  watchman: false,
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  setupFiles: ['reflect-metadata'],
  // Match the application's ESM modules and preserve Nest decorator metadata.
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.json' }],
  },
  // NodeNext source imports end in .js; during tests resolve their .ts sources.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: [
    'src/photos/**/*.ts',
    'src/storage/storage.service.ts',
    'src/http/**/*.ts',
    'src/config/environment.ts',
    'src/health/health.service.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.module.ts',
    '!src/**/entities/**',
    '!src/**/dto/project-photos-response.dto.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageProvider: 'v8',
};

export default config;
