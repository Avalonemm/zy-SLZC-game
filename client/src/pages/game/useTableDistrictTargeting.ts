import { useCallback, useState } from "react";
import type { TableDistrictTargetSource } from "./tableDistrictTargeting";

export function useTableDistrictTargeting() {
  const [source, setSource] = useState<TableDistrictTargetSource | null>(null);
  const begin = useCallback((nextSource: TableDistrictTargetSource) => setSource(nextSource), []);
  const cancel = useCallback(() => setSource(null), []);

  return {
    source,
    begin,
    cancel
  };
}
