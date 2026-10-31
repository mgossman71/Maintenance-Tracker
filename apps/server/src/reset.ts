import { deleteAllSessions, setSetting } from "@maintenance-tracker/db";
import { setupRequestSchema } from "@maintenance-tracker/shared";
import { hashPassword } from "./auth/password.ts";
import { PASSWORD_HASH_KEY } from "./routes/auth.ts";

/**
 * Emergency master-password reset (§6.1): headless Docker has no
 * forgotten-password email, so the operator proves shell access to the
 * container and the CLI rewrites the hash. Every session is revoked —
 * whoever set this password must have been locked out of their own app.
 */
export async function resetMasterPassword(
  db: Parameters<typeof setSetting>[0],
  password: string,
): Promise<void> {
  // the SAME policy as first-run setup — a reset must not mint weak hashes
  const parsed = setupRequestSchema.safeParse({ password });
  if (!parsed.success) {
    throw new Error("new password rejected: at least 12 characters (same policy as setup)");
  }
  setSetting(db, PASSWORD_HASH_KEY, await hashPassword(password));
  deleteAllSessions(db);
}

/** `--reset-password [new]` — the value may follow the flag; absent, we prompt. */
export function parseResetArgv(argv: string[]): {
  reset: boolean;
  password?: string;
  help: boolean;
} {
  return {
    reset: argv.includes("--reset-password"),
    password: (() => {
      const i = argv.indexOf("--reset-password");
      const next = i >= 0 ? argv[i + 1] : undefined;
      return next !== undefined && !next.startsWith("-") ? next : undefined;
    })(),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}
