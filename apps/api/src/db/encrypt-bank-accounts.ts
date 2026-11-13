import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { Secrets } from "../common/secrets";
import { loadDotEnv, parseEnv } from "../config/env";

/**
 * `pnpm db:encrypt-bank`: encrypts the bank account numbers that were written in clear (before the encryption existed). Safe to run again: a number that is already encrypted is skipped.
 * Each number is encrypted, decrypted again and compared before it is written; nothing is printed except how many rows were changed (never a number).
 */
export async function encryptBankAccounts(executor: { execute: ReturnType<typeof drizzle>["execute"] }, secrets: Secrets): Promise<number> {
  const rows = (await executor.execute(sql`select id, bank_account_number as n from withdrawals where bank_account_number <> '' and bank_account_number not like 'enc:v1:%'`)).rows as { id: string; n: string }[];
  let changed = 0;
  for (const row of rows) {
    const enc = secrets.encrypt("bank-account", row.n);
    if (secrets.decrypt("bank-account", enc) !== row.n) throw new Error("Encryption check failed; nothing more was written");
    await executor.execute(sql`update withdrawals set bank_account_number = ${enc} where id = ${row.id}`);
    changed++;
  }
  return changed;
}

async function main(): Promise<void> {
  loadDotEnv();
  const env = parseEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    const changed = await encryptBankAccounts(drizzle(pool), new Secrets(env.APP_SECRET));
    console.log(`Encrypted ${changed} bank account number(s).`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && /encrypt-bank(-accounts)?\.[cm]?[jt]s$/.test(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Failed");
    process.exit(1);
  });
}
