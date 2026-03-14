module.exports = {
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.js'],
    exclude: ['tests/e2e/**'],
    restoreMocks: true,
    clearMocks: true,
    mockReset: true
  }
};
