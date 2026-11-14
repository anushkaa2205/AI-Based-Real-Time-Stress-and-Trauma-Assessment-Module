/**
 * POST /api/v1/realtime/auth (task 5.1, API_CONTRACTS §7): Pusher private-channel
 * sign-in for staff. Applies the same policies as the REST API.
 * pusher-js sends `socket_id` and `channel_name` as a form.
 */
import { pusherClient } from "@/lib/realtime/publish";
import { staffCanSubscribe } from "@/lib/realtime/authorize";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/problem";
import { route } from "@/lib/route";

export const POST = route({ auth: "staff" }, async ({ req, user }) => {
  if (env().REALTIME_DRIVER !== "pusher") throw new ApiError("NOT_FOUND");
  const form = new URLSearchParams(await req.text());
  const socketId = form.get("socket_id") ?? "";
  const channel = form.get("channel_name") ?? "";
  if (!/^\d+\.\d+$/.test(socketId) || !channel) throw new ApiError("VALIDATION_FAILED", "socket_id and channel_name are required");
  if (!(await staffCanSubscribe(user, channel))) throw new ApiError("FORBIDDEN");
  return pusherClient().authorizeChannel(socketId, channel);
});
