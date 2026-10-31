module.exports = {
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.mjs'],
  testEnvironment: 'node',
  testRegex: '.e2e-spec.ts$',
  // Admission transaction tests have their own guarded replica-set runner.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/admissions/'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/../tsconfig.spec.json',
        useESM: true,
      },
    ],
  },
  testTimeout: 30000,
};
