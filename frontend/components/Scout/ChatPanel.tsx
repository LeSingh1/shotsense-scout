"use client";

export function ChatPanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border">
        <span className="text-[10px] text-dim font-mono uppercase tracking-widest">
          Ask the Scout
        </span>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center justify-center h-full">
          <p className="text-xs text-dim text-center leading-relaxed max-w-[200px]">
            Ask questions about player tendencies, shot patterns, and matchup
            analysis.
          </p>
        </div>
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <input
            type="text"
            disabled
            placeholder="Connect API key to chat..."
            className="flex-1 px-3 py-2 text-xs bg-surface-2 border border-border rounded text-dim placeholder:text-dim/60 cursor-not-allowed"
          />
          <button
            disabled
            className="px-3 py-2 text-xs font-mono uppercase tracking-wider bg-border text-dim rounded cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
