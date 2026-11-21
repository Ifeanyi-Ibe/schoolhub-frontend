// The class arms of every level, as options for a picker ("JSS1 · A"). Reads class levels and their arms
// (academics.read). The arms are read per level, in parallel, once the screen needs a picker.
import { useQueries, useQuery } from "@tanstack/react-query";
import { armsQuery, levelsQuery } from "@/features/academics/api";

export interface ArmOption {
  id: string;
  label: string;
}

export function useArmOptions(enabled: boolean): ArmOption[] {
  const levels = useQuery({ ...levelsQuery, enabled });
  const arms = useQueries({
    queries: (levels.data ?? []).map((l) => ({ ...armsQuery(l.id), enabled })),
  });
  return (levels.data ?? []).flatMap((level, i) =>
    (arms[i]?.data ?? []).map((arm) => ({ id: arm.id, label: `${level.name} · ${arm.name}` })),
  );
}
