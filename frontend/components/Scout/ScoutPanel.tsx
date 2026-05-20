"use client";

import { ReportCard } from "./ReportCard";
import { ChatPanel } from "./ChatPanel";

export function ScoutPanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto border-b border-border">
        <ReportCard />
      </div>
      <div className="h-[350px] shrink-0">
        <ChatPanel />
      </div>
    </div>
  );
}
