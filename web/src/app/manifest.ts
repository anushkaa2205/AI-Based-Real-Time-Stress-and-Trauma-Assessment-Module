/** Web app manifest (task 9.7, AC-CH-06): installable on Android; opens on the language choice. */
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NHAA Assist: National Helpline Against Atrocities 14566",
    short_name: "NHAA 14566",
    description: "Tell us what happened, in your language. Help is available.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f4ef",
    theme_color: "#1f3a5f",
    lang: "en",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
