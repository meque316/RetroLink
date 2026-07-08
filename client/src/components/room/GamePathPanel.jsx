function GamePathPanel({ game, gamePath, onBrowse }) {
  return (
    <div className="bg-[#0d1117] rounded-2xl p-4 md:p-5 mb-6 border border-zinc-800">
      <h2 className="text-base md:text-lg font-semibold mb-2">
        {game}
      </h2>

      <p className="text-xs md:text-sm text-zinc-400 mb-3">
        Executable Path
      </p>

      {gamePath ? (
        <>
          <p className="text-green-400 text-xs md:text-sm break-all mb-2">
            {gamePath}
          </p>

          <p className="text-xs text-green-500">
            ✓ Ready to launch
          </p>
        </>
      ) : (
        <p className="text-yellow-400 text-xs md:text-sm mb-3">
          ⚠️ Executable not configured
        </p>
      )}

      <button
        onClick={onBrowse}
        className="mt-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition text-sm"
        type="button"
      >
        Browse
      </button>
    </div>
  );
}

export default GamePathPanel;