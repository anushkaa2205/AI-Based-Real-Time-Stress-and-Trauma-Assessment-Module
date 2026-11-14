/** Auth.js v5 for staff (task 1.6). Victims never use this; they get a session token (task 3.2). */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { authorizeStaff } from "@/core/auth/login";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, pendingToken: {}, code: {} },
      authorize: (creds) => authorizeStaff(creds),
    }),
  ],
});
