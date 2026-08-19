// client/src/components/room/match-info/AOMMatchInfo.jsx

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

export default function AOMMatchInfo({ gameOptions, isHost }) {
  const [clientPort, setClientPort] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isHost) {
      return;
    }

    let isMounted = true;

    window.retroLink
      .getClientPort()
      .then((port) => {
        if (isMounted && port) {
          setClientPort(port);
        }
      });

    window.retroLink.onClientPortAssigned((port) => {
      if (isMounted) {
        setClientPort(port);
      }
    });

    return () => {
      isMounted = false;
      window.retroLink.offClientPortAssigned();
    };
  }, [isHost]);

  const directIP =
    clientPort ? `127.0.0.1:${clientPort}` : null;

  function handleCopy() {
    if (!directIP) {
      return;
    }

    navigator.clipboard.writeText(directIP);

    setCopied(true);

    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-[#0f151d] p-4">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-zinc-500">
          Age of Mythology
        </span>
      </div>

      <p className="text-sm text-zinc-400">
        Este juego no tiene descubrimiento automático de partidas en LAN.
        La conexión debe hacerse manualmente por Direct IP.
      </p>

      {isHost ? (
        <div className="rounded-lg border border-zinc-800 bg-[#0b1118] p-3 text-xs text-zinc-400">
          <p className="mb-1 text-zinc-300">Pasos como anfitrión:</p>
          <p>1. Abrí AoM → Multiplayer → LAN → Create Game.</p>
          <p>2. Esperá a que los jugadores se conecten por Direct IP.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-800 bg-[#0b1118] p-3 text-xs text-zinc-400">
          <p className="mb-2 text-zinc-300">Pasos como jugador:</p>
          <p className="mb-2">
            1. Abrí AoM → Multiplayer → LAN → Direct IP.
          </p>

          <p className="mb-2">2. Ingresá esta dirección:</p>

          <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-700 bg-[#111821] px-3 py-2">
            <span className="font-mono text-sm text-white">
              {directIP || "Esperando puerto..."}
            </span>

            {directIP && (
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 transition hover:border-zinc-500"
              >
                {copied ? (
                  <>
                    <Check size={12} />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    Copiar
                  </>
                )}
              </button>
            )}
          </div>

          <p className="mt-2">3. Presioná Connect.</p>
        </div>
      )}
    </div>
  );
}
