/** Auth.js v5 for staff (task 1.6). Victims never use this; they get a session token (task 3.2). */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { authorizeStaff } from "@/core/auth/login";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // Wrong passwords and codes are normal, not errors; log other problems by type only (NFR-REL-03).
  logger: {
    error(error) {
      if (error.name === "CredentialsSignin") return;
      console.error(`[auth] ${error.name}`);
    },
    warn(code) {
      console.warn(`[auth] warning ${code}`);
    },
  },
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, pendingToken: {}, code: {} },
      authorize: (creds) => authorizeStaff(creds),
    }),
  ],
});
