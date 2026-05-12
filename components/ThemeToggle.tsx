"use client";

// Light / dark mode toggle. Mirrors capconvert-pm's pattern (same localStorage
// key, same .dark class on <html>) so the UX is consistent across ops apps.
// Uses inline SVGs to match the rest of TopBar and avoid a lucide-react dep.

import { useEffect, useState } from "react";

type Mode = "light" | "dark";

const STORAGE_KEY = "capconvert-theme";

function readInitial(): Mode {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMode(readInitial());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Mode = mode === "dark" ? "light" : "dark";
    setMode(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage may be unavailable (private mode); the in-memory toggle still works.
    }
  }

  // Opaque placeholder pre-hydration to avoid icon mismatch flash.
  if (!mounted) {
    return (
      <button
        type="button"
        aria-hidden
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-custom-darkGrey opacity-0"
        tabIndex={-1}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
        </svg>
      </button>
    );
  }

  const label = mode === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-custom-darkGrey text-custom-muted transition-colors hover:text-custom-cyan"
    >
      {mode === "dark" ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
