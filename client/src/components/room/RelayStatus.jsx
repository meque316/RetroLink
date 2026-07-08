import { Radio } from "lucide-react";

function RelayStatus({ relayStatus, relayStep }) {
  if (relayStatus === null) {
    return (
      <div className="flex items-center gap-3 bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-3 mb-4 text-sm text-zinc-400">
        <Radio size={15} className="animate-pulse" />
        <span>{relayStep || "Conectando..."}</span>
      </div>
    );
  }

  if (relayStatus === "ok") {
    return (
      <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 mb-4 text-sm text-green-400">
        <Radio size={15} className="text-green-400" />
        <span className="font-medium">
          {relayStep || "✅ Conexión P2P establecida"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4 text-sm text-red-400">
      <div className="flex items-center gap-3">
        <Radio size={15} />
        <span className="font-medium">❌ Connection failed</span>
      </div>

      {relayStep && (
        <p className="text-xs text-red-300 pl-6">
          {relayStep}
        </p>
      )}
    </div>
  );
}

export default RelayStatus;