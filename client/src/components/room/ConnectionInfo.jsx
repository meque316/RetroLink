// client/src/components/room/ConnectionInfo.jsx

import React, { useState } from 'react';
import { Copy, Check, Wifi } from 'lucide-react';

export default function ConnectionInfo({ gameId, clientPort, hostIP }) {
  const [copied, setCopied] = useState(false);

  const needsDirectIP = ['aom', 'swgb', 'carmageddon2', 'dow_soulstorm'].includes(gameId);

  if (!needsDirectIP || !clientPort) {
    return null;
  }

  // ===== MODIFICADO: Usar hostIP si está disponible =====
  const connectionString = `${hostIP || '127.0.0.1'}:${clientPort}`;
  // ===== FIN MODIFICADO =====

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(connectionString);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error('Error al copiar:', err);
      const textarea = document.createElement('textarea');
      textarea.value = connectionString;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const getInstructions = (gameId) => {
    switch (gameId) {
      case 'aom':
        return (
          <ol className="mt-1 list-inside list-decimal text-xs text-zinc-400">
            <li>Abre Age of Mythology</li>
            <li>Multiplayer → LAN → Direct IP</li>
            <li>Pega la IP y presiona Connect</li>
          </ol>
        );
      case 'swgb':
        return (
          <ol className="mt-1 list-inside list-decimal text-xs text-zinc-400">
            <li>Abre Star Wars: Galactic Battlegrounds</li>
            <li>Multiplayer → LAN → Direct IP</li>
            <li>Pega la IP y presiona Connect</li>
          </ol>
        );
      case 'carmageddon2':
        return (
          <ol className="mt-1 list-inside list-decimal text-xs text-zinc-400">
            <li>Abre Carmageddon 2</li>
            <li>Multiplayer → Direct IP</li>
            <li>Pega la IP y presiona Connect</li>
          </ol>
        );
      case 'dow_soulstorm':
        return (
          <ol className="mt-1 list-inside list-decimal text-xs text-zinc-400">
            <li>Abre Warhammer 40,000: Dawn of War - Soulstorm</li>
            <li>Multiplayer → Anfitrión (Host) o Unirse (Join)</li>
            <li>Si eres el host, espera a que los jugadores se unan</li>
            <li>Si eres jugador, pega la IP y presiona Conectar</li>
          </ol>
        );
      default:
        return (
          <p className="mt-1 text-xs text-zinc-400">
            Usa Direct IP en el menú multiplayer del juego.
          </p>
        );
    }
  };

  const gameNames = {
    aom: 'Age of Mythology',
    swgb: 'Star Wars: Galactic Battlegrounds',
    carmageddon2: 'Carmageddon 2',
    dow_soulstorm: 'Warhammer 40,000: Dawn of War - Soulstorm',
  };

  return (
    <div className="mt-4 rounded-xl border border-zinc-800 bg-[#0f151d] p-4">
      <div className="flex items-center gap-2">
        <Wifi size={16} className="text-green-400" />
        <p className="text-xs uppercase tracking-wider text-zinc-500">
          Conexión Direct IP - {gameNames[gameId] || gameId}
        </p>
      </div>

      <div className="mt-2 flex items-center justify-between gap-4">
        <div className="flex-1">
          <p className="font-mono text-xl font-bold text-green-400">
            {connectionString}
          </p>
          <p className="text-xs text-zinc-500">
            {hostIP && hostIP !== '127.0.0.1' 
              ? 'IP del host (ENE)' 
              : 'Puerto asignado por RetroLink'}
          </p>
        </div>

        <button
          onClick={handleCopy}
          className={`flex h-11 min-w-[110px] items-center justify-center gap-2 rounded-lg px-4 font-medium transition ${
            copied
              ? 'border border-green-500/30 bg-green-500/10 text-green-400'
              : 'border border-zinc-700 bg-zinc-800/50 text-white hover:bg-zinc-700'
          }`}
        >
          {copied ? (
            <>
              <Check size={16} />
              Copiado
            </>
          ) : (
            <>
              <Copy size={16} />
              Copiar IP
            </>
          )}
        </button>
      </div>

      {copied && (
        <p className="mt-2 text-xs text-green-400">✓ IP copiada al portapapeles</p>
      )}

      <div className="mt-3 rounded-lg bg-zinc-800/30 p-3">
        <p className="text-xs font-medium text-zinc-300">📌 Instrucciones:</p>
        {getInstructions(gameId)}
      </div>
    </div>
  );
}