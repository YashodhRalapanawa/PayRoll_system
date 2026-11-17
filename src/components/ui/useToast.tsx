"use client";
import { useCallback, useState } from "react";
import { Toast } from "./index";

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const clear = useCallback(() => setMsg(null), []);
  const node = <Toast message={msg} onDone={clear} />;
  return [node, setMsg] as const;
}
