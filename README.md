# Project 2: Extending the JKWS Server
- JavaScript

## Prerequisites
- Node.js 18+
- npm
- SQLite 3

## Installation

npm install

## Running Server

npm start

## Tests

npm test

## Linting

npm run lint

npm run lint:fix

## Features

- SQLite Persistence: RSA private keys stored in totally_not_my_privateKeys.db
- PKCS#1 Private Key Storage: Saves keys as PEM ("-----BEGIN RSA PRIVATE KEY-----")
- Secure SQL Queries: Uses parameterized statements to prevent injection
- Automatic Key Seeding: Generates one active and one expired key on startup
- Standards-Compliant JWKS: Proper kid, kty, use, alg fields (RS256)
- RESTful Design: Proper HTTP status codes and CORS support
- Jest + Supertest Testing: Automated coverage summary
- ESLint Flat Config: Modern linting for Node + Jest

## Endpoints

- GET /.well-known/jwks.json
→ Returns active (non-expired) JWKS keys.

- POST /auth
→ Issues a JWT signed by the latest active key.
→ Accepts empty POST, JSON payload {"username":"userABC","password":"password123"},
or Basic Auth (mocked).
→ Response: { "jwt": "<token>", "token": "<token>" }

- POST /auth?expired=1
→ Issues a JWT signed by the latest expired key.
→ Response: { "jwt": "<expired_token>", "token": "<expired_token>" }
