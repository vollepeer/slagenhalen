import { useEffect, useState } from "react";
import { getQueueLength, onQueueChange } from "./retryQueue";

export function usePendingSyncCount(): number {
  const [count, setCount] = useState(getQueueLength());
  useEffect(() => onQueueChange(setCount), []);
  return count;
}
