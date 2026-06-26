module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__', '<rootDir>/src'],
  setupFiles: ['<rootDir>/__tests__/setup.env.cjs'],
  moduleNameMapper: {
    '^@tds/shared$': '<rootDir>/../shared/src',
  },
};
