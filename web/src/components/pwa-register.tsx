"use client";

/** Registers the app-shell service worker in production builds only (task 9.7). */
import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* the site works the same without it */
    });
  }, []);
  return null;
}
