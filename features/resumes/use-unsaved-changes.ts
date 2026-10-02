"use client";
import { useEffect } from "react";

export const DISCARD_EDITS = "You have unsaved changes. Leave without saving?";

export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element | null)?.closest("a[href]");
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      )
        return;
      const url = new URL(anchor.href);
      if (
        url.pathname === location.pathname &&
        url.search === location.search &&
        url.hash
      )
        return;
      if (!window.confirm(DISCARD_EDITS)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    // The Navigation API also covers cancellable browser history traversals.
    const navigation = (window as unknown as { navigation?: EventTarget })
      .navigation;
    const navigate = (event: Event) => {
      const e = event as Event & { navigationType?: string };
      if (
        e.navigationType === "traverse" &&
        e.cancelable &&
        !window.confirm(DISCARD_EDITS)
      )
        e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    navigation?.addEventListener("navigate", navigate);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
      navigation?.removeEventListener("navigate", navigate);
    };
  }, [dirty]);
}
