// Server Component — loads all data and passes to client panels.

import { getAppData } from "@/lib/data";
import { Topbar } from "@/components/Layout/Topbar";
import { Dashboard } from "@/components/Layout/Dashboard";
import { FilterPanel } from "@/components/Filters/FilterPanel";
import { CourtPanel } from "@/components/Court/CourtPanel";
import { ScoutPanel } from "@/components/Scout/ScoutPanel";

export default function Page() {
  const data = getAppData();

  return (
    <>
      <Topbar />
      <Dashboard
        left={<FilterPanel data={data} />}
        center={<CourtPanel shots={data.shots} />}
        right={<ScoutPanel />}
      />
    </>
  );
}
