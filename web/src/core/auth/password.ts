/** Staff password hashing with bcrypt (task 1.6). */
import bcrypt from "bcryptjs";

const COST = 12;

let dummyHash: Promise<string> | undefined;
/** Compared against when the user does not exist, so timing does not reveal valid e-mails. */
function dummy(): Promise<string> {
  dummyHash ??= bcrypt.hash("not-a-real-password", COST);
  return dummyHash;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  const ok = await bcrypt.compare(plain, hash ?? (await dummy()));
  return ok && !!hash;
}
