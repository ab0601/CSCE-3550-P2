export default {
  testEnvironment: "node",
  transform: {},                 
  collectCoverage: true,
  collectCoverageFrom: ["server.mjs"],
  coverageReporters: ["text"],   
  testMatch: [
    "**/__tests__/**/*.mjs",
    "**/?(*.)+(spec|test).mjs"
  ],
};
