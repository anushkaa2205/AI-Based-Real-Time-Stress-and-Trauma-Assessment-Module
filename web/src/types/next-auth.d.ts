import type { DefaultSession } from "next-auth";
import type { Role } from "@/models/enums";

declare module "next-auth" {
  interface User {
    role?: Role;
    districtId?: string | null;
    stateId?: string | null;
  }
  interface Session {
    user: {
      id: string;
      role: Role;
      districtId: string | null;
      stateId: string | null;
    } & DefaultSession["user"];
  }
}
