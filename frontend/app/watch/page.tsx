// Server Component shell for the /watch route. Reads the shot-level JSON
// at build time and hands it to the client subtree that runs MoveNet,
// HSV ball tracking, and the demo xFG predictor in the browser.

import { getAppData } from "@/lib/data";
import { NikeTopbar } from "@/components/nike/Topbar";
import { WatchShot } from "@/components/watch/WatchShot";

export default function WatchPage() {
  const data = getAppData();
  return (
    <main id="main-content" className="bg-[#0a0a0a] min-h-screen">
      <NikeTopbar />
      <WatchShot shots={data.shots} />
      <footer className="bg-black text-white/40 text-xs py-8 px-8 md:px-16 border-t border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between gap-3">
          <span>
            NBA xFG% · Live tracking demo · MoveNet Thunder + HSV ball detection
          </span>
          <span>Everything runs locally — your video never uploads.</span>
        </div>
      </footer>
    </main>
  );
}
