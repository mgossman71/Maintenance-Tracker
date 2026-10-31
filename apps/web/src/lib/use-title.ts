import { useEffect } from "react";

/** Keeps document.title honest per page without router-version coupling. */
export function useTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
