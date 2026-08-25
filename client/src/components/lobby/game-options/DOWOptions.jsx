// client/src/components/lobby/game-options/DOWOptions.jsx

export default function DOWOptions() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-[#0f151d] p-4">
      <p className="text-sm text-zinc-400">
        Warhammer 40,000: Dawn of War - Soulstorm utiliza su propio lobby para configurar partidas.
      </p>
      <p className="text-xs text-zinc-500">
        Las opciones de mapa, raza y jugadores se configuran dentro del juego.
      </p>
    </div>
  );
}