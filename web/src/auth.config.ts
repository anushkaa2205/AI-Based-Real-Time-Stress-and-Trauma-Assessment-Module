/**
 * Auth.js settings shared by the server (`src/auth.ts`) and the proxy.
 * No providers or database code here, so the proxy stays light.
 * NFR-SEC-03: 15-minute idle timeout (sliding: refreshed at most once a minute).
 */
import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/models/enums";

export const SESSION_IDLE_SECONDS = 15 * 60;

export const authConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: SESSION_IDLE_SECONDS, updateAge: 60 },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id as string;
        token.role = user.role as Role;
        token.districtId = user.districtId ?? null;
        token.stateId = user.stateId ?? null;
      }
      return token;
    },
    session({ session, token }) {
      // Fields set in the jwt callback above.
      const t = token as typeof token & { uid: string; role: Role; districtId: string | null; stateId: string | null };
      session.user.id = t.uid;
      session.user.role = t.role;
      session.user.districtId = t.districtId;
      session.user.stateId = t.stateId;
      return session;
    },
  },
} satisfies NextAuthConfig;
