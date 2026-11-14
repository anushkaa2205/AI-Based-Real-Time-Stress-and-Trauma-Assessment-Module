import { Suspense } from "react";
import { ChatScreen } from "@/components/victim/chat-screen";

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatScreen />
    </Suspense>
  );
}
