import express from "express";
import morgan from "morgan";
import {
  generateKeyPair,
  exportJWK,
  SignJWT,
  exportPKCS8,  
} from "jose";
import Database from "better-sqlite3";
import { createPublicKey, createPrivateKey } from "crypto";

const PORT = 8080;

// Time helpers
const nowMs = () => Date.now();
const nowSec = () => Math.floor(nowMs() / 1000);

// SQLite setup
const DB_FILE = process.env.DB_FILE || "totally_not_my_privateKeys.db";
const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");

db.prepare(
  `CREATE TABLE IF NOT EXISTS keys(
     kid INTEGER PRIMARY KEY AUTOINCREMENT,
     key BLOB NOT NULL,
     exp INTEGER NOT NULL
   )`
).run();

// Data access 
function insertKey({ pem, exp }) {
  const stmt = db.prepare("INSERT INTO keys (key, exp) VALUES (?, ?)");
  const info = stmt.run(Buffer.from(pem, "utf8"), exp);
  return Number(info.lastInsertRowid);
}
function selectOneKey({ wantExpired }) {
  const t = nowSec();
  if (wantExpired) {
    return (
      db
        .prepare("SELECT kid, key, exp FROM keys WHERE exp <= ? ORDER BY exp DESC LIMIT 1")
        .get(t) || null
    );
  }
  return (
    db
      .prepare("SELECT kid, key, exp FROM keys WHERE exp > ? ORDER BY exp ASC LIMIT 1")
      .get(t) || null
  );
}
function selectAllValidKeys() {
  const t = nowSec();
  return db
    .prepare("SELECT kid, key, exp FROM keys WHERE exp > ? ORDER BY exp ASC")
    .all(t);
}
function hasActiveKey() {
  const t = nowSec();
  return !!db.prepare("SELECT 1 FROM keys WHERE exp > ? LIMIT 1").get(t);
}
function hasExpiredKey() {
  const t = nowSec();
  return !!db.prepare("SELECT 1 FROM keys WHERE exp <= ? LIMIT 1").get(t);
}
function countKeys() {
  return Number(db.prepare("SELECT COUNT(*) AS c FROM keys").get().c);
}

// Key generation
async function generateAndStoreRsaKey({ ttlSeconds }) {
  const { privateKey } = await generateKeyPair("RS256", { modulusLength: 2048 });

  const pkcs8Pem = await exportPKCS8(privateKey);

  const keyObj = createPrivateKey(pkcs8Pem);
  const pkcs1Pem = keyObj.export({ type: "pkcs1", format: "pem" }); 

  const exp = nowSec() + Math.floor(ttlSeconds);
  const kid = insertKey({ pem: pkcs1Pem, exp });
  return { kid, exp };
}

async function ensureSeedKeys() {
  if (countKeys() > 0) return;
  await generateAndStoreRsaKey({ ttlSeconds: 60 * 60 });   
  await generateAndStoreRsaKey({ ttlSeconds: -5 * 60 });   
}

async function ensureActiveKeyPresent() {
  if (!hasActiveKey()) {
    await generateAndStoreRsaKey({ ttlSeconds: 60 * 60 }); 
  }
}
async function ensureExpiredKeyPresent() {
  if (!hasExpiredKey()) {
    await generateAndStoreRsaKey({ ttlSeconds: -60 }); 
  }
}

// Express app
const app = express();
app.use(morgan("dev"));
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// 405 guard
function methodGuard(allowed, allowHeader) {
  return (req, res, next) => {
    if (!allowed.includes(req.method)) {
      res.setHeader("Allow", allowHeader);
      return res.status(405).json({ error: "not allowed" });
    }
    next();
  };
}
app.all("/jwks", methodGuard(["GET"], "GET"));
app.all("/.well-known/jwks.json", methodGuard(["GET"], "GET"));
app.all("/auth", methodGuard(["POST"], "POST"));

// Helpers 
function keyObjectFromDbRow(row) {
  const pem = Buffer.isBuffer(row.key) ? row.key.toString("utf8") : String(row.key); 
  return createPrivateKey(pem); 
}
async function publicJwkFromPrivateKey(privateKey, kidLabel) {
  const nodePublicKey = createPublicKey(privateKey);
  const jwk = await exportJWK(nodePublicKey);
  jwk.kid = kidLabel;
  jwk.kty = "RSA";
  jwk.use = "sig";
  jwk.alg = "RS256";
  return jwk;
}
function isExpiredRow(row) {
  return Number(row.exp) <= nowSec();
}
function kidLabelForRow(row) {
  return isExpiredRow(row) ? "key-expired-1" : "key-active-1";
}

// Routes
app.get(["/jwks", "/.well-known/jwks.json"], async (_req, res) => {
  try {
    await ensureActiveKeyPresent();
    let rows = selectAllValidKeys();
    if (!rows.length) {
      await ensureActiveKeyPresent();
      rows = selectAllValidKeys();
    }
    if (!rows.length) return res.status(404).json({ error: "no keys available" });

    const out = [];
    for (const r of rows) {
      const privKeyObj = keyObjectFromDbRow(r);
      const jwk = await publicJwkFromPrivateKey(privKeyObj, kidLabelForRow(r));
      out.push(jwk);
      break; 
    }
    return res.status(200).json({ keys: out });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/auth", async (req, res) => {
  try {
    const wantExpired =
      "expired" in req.query &&
      (req.query.expired === "" ||
        String(req.query.expired).toLowerCase() === "1" ||
        String(req.query.expired).toLowerCase() === "true");

    if (wantExpired) {
      await ensureExpiredKeyPresent();
    } else {
      await ensureActiveKeyPresent();
    }

    let row = selectOneKey({ wantExpired });
    if (!row) {
      if (wantExpired) await ensureExpiredKeyPresent();
      else await ensureActiveKeyPresent();
      row = selectOneKey({ wantExpired });
    }
    if (!row) {
      return res
        .status(401)
        .json({ error: `No ${wantExpired ? "expired" : "active"} key available` });
    }

    const privateKeyObj = keyObjectFromDbRow(row);
    const iat = nowSec();
    const exp = wantExpired ? Number(row.exp) : iat + 60 * 5;
    const kidLabel = kidLabelForRow(row);

    const token = await new SignJWT({
      sub: "userABC",
      iss: "jwks-server",
      aud: "gradebot",
      kid_db: String(row.kid),
    })
      .setProtectedHeader({ alg: "RS256", kid: kidLabel })
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(privateKeyObj);

    return res.status(200).json({ jwt: token, token });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 404
app.use((req, res) => res.status(404).json({ error: "not found" }));

// Startup 
await ensureSeedKeys();

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => console.log(`JWKS server running at http://localhost:${PORT}`));
}

export default app;
