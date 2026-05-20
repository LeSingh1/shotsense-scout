"use client";

import type { ReactNode } from "react";

type Props = {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
};

export function Dashboard({ left, center, right }: Props) {
  return (
    <div className="flex" style={{ height: "calc(100vh - 3.5rem)" }}>
      <aside className="w-[280px] shrink-0 border-r border-border overflow-y-auto bg-surface">
        {left}
      </aside>
      <main id="main-content" className="flex-1 overflow-y-auto">
        {center}
      </main>
      <aside className="w-[380px] shrink-0 border-l border-border overflow-y-auto bg-surface">
        {right}
      </aside>
    </div>
  );
}
