import { randomBytes, timingSafeEqual } from "node:crypto";
import { argon2id } from "hash-wasm";

/**
 * argon2id password hashing (§6.1), PHC string format:
 *   $argon2id$v=19$m=65536,t=3,p=1$<b64salt>$<b64hash>
 *
 * hash-wasm keeps this pure WASM — no native toolchain, matches the stack
 * table. Production parameters are the OWASP baseline; verification reuses
 * the parameters embedded in the stored hash, so old hashes stay verifiable
 * when these constants change.
 *
 * MT_ARGON2_PRESET=test switches to cheap-but-real parameters so the test
 * suite runs in milliseconds instead of minutes.
 */

interface Argon2Params {
  memorySize: number; // KiB
  iterations: number;
  parallelism: number;
  hashLength: number;
}

const PROD_PARAMS: Argon2Params = {
  memorySize: 65536,
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
};
const TEST_PARAMS: Argon2Params = {
  memorySize: 8192,
  iterations: 1,
  parallelism: 1,
  hashLength: 32,
};

function currentParams(): Argon2Params {
  return process.env.MT_ARGON2_PRESET === "test" ? TEST_PARAMS : PROD_PARAMS;
}

function toB64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function fromB64(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64"));
}

async function derive(password: string, salt: Uint8Array, p: Argon2Params): Promise<Uint8Array> {
  return argon2id({
    password,
    salt,
    parallelism: p.parallelism,
    iterations: p.iterations,
    memorySize: p.memorySize,
    hashLength: p.hashLength,
    version: 0x13,
    outputType: "binary",
  });
}

export async function hashPassword(password: string): Promise<string> {
  const params = currentParams();
  const salt = randomBytes(16);
  const hash = await derive(password, salt, params);
  return (
    `$argon2id$v=19$m=${params.memorySize},t=${params.iterations},p=${params.parallelism}` +
    `$${toB64(salt)}$${toB64(hash)}`
  );
}

/**
 * Verify against a PHC string. Returns false for malformed input (never
 * throws at callers). Constant-time comparison — §6.4's timing-equalized
 * hash compare.
 */
export async function verifyPassword(password: string, phcString: string): Promise<boolean> {
  const parts = phcString.split("$");
  // ["", "argon2id", "v=19", "m=…,t=…,p=…", salt, hash]
  if (parts.length !== 6 || parts[1] !== "argon2id") return false;
  const paramPairs = Object.fromEntries(
    (parts[3] ?? "").split(",").map((kv) => kv.split("=") as [string, string]),
  );
  const params: Argon2Params = {
    memorySize: Number(paramPairs["m"]),
    iterations: Number(paramPairs["t"]),
    parallelism: Number(paramPairs["p"]),
    hashLength: 32,
  };
  if (!Number.isFinite(params.memorySize) || !Number.isFinite(params.iterations)) return false;
  try {
    const salt = fromB64(parts[4] ?? "");
    const expected = fromB64(parts[5] ?? "");
    if (expected.length === 0 || salt.length === 0) return false;
    const actual = await derive(password, salt, { ...params, hashLength: expected.length });
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  } catch {
    return false;
  }
}
