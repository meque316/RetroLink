// client/src/components/lobby/game-options/AOMOptions.jsx

export default function AOMOptions() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-[#0f151d] p-4">
      <p className="text-sm text-zinc-400">
        Age of Mythology utiliza su propio lobby para configurar partidas.
      </p>
      <p className="text-xs text-zinc-500">
        Las opciones de mapa, civilización y jugadores se configuran dentro del juego.
      </p>
    </div>
  );
}