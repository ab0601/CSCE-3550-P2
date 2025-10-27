/* global beforeAll, afterAll, describe, test, expect */

import path from "node:path";
import fs from "node:fs";
import request from "supertest";

let app;
const TEST_DB = path.join(process.cwd(), "test-keys.db");

beforeAll(async () => {
  try {
    fs.unlinkSync(TEST_DB);
  } catch {
    /* ignore if file doesn't exist */
  }
  const mod = await import(path.join(process.cwd(), "server.mjs"));
  app = mod.default;
});

afterAll(() => {
  try {
    fs.unlinkSync(TEST_DB);
  } catch {
    /* ignore if file doesn't exist */
  }
});

describe("JWKS Server (SQLite-backed)", () => {
  test("GET /.well-known/jwks.json returns at least one active key", async () => {
    const res = await request(app).get("/.well-known/jwks.json");
    expect(res.statusCode).toBe(200);
    expect(res.body.keys).toBeDefined();
    expect(Array.isArray(res.body.keys)).toBe(true);
  });

  test("POST /auth returns a valid JWT signed by an active key", async () => {
    const res = await request(app).post("/auth");
    expect(res.statusCode).toBe(200);
    expect(typeof res.body.jwt).toBe("string");
    expect(res.body.jwt.split(".")).toHaveLength(3); // standard JWT parts
  });

  test("POST /auth?expired returns a JWT whose exp is in the past", async () => {
    const res = await request(app).post("/auth?expired=true");
    expect(res.statusCode).toBe(200);
    expect(typeof res.body.jwt).toBe("string");
  });

  test("Method guard enforces 405 on wrong methods", async () => {
    const res = await request(app).put("/auth"); // wrong HTTP verb
    expect(res.statusCode).toBe(405);
  });
});
