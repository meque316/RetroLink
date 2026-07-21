import { useState } from "react";

const GAME_ID_ALIASES = {
  quake3: "quake3",
  "quake iii arena": "quake3",

  cs16: "cs16",
  "counter-strike 1.6": "cs16",

  ut99: "ut99",
  "unreal tournament": "ut99",

  carmageddon2: "carmageddon2",
  "carmageddon ii: carpocalypse now": "carmageddon2",
};

function normalizeGameId(value) {
  if (!value) return null;

  const normalized = String(value).trim().toLowerCase();

  return GAME_ID_ALIASES[normalized] ?? normalized;
}

function normalizeLibrary(library) {
  const uniqueGames = new Map();

  for (const game of library) {
    const canonicalId = normalizeGameId(game.id ?? game.name);

    if (!canonicalId) continue;

    const previous = uniqueGames.get(canonicalId);

    uniqueGames.set(canonicalId, {
      ...previous,
      ...game,
      id: canonicalId,
      name: game.name ?? previous?.name,
      year: game.year ?? previous?.year,
      exePath: game.exePath ?? previous?.exePath,
    });
  }

  return [...uniqueGames.values()];
}

function loadLibrary() {
  try {
    const stored = JSON.parse(
      localStorage.getItem("retrolink_library") || "[]"
    );

    const normalized = normalizeLibrary(
      Array.isArray(stored) ? stored : []
    );

    localStorage.setItem(
      "retrolink_library",
      JSON.stringify(normalized)
    );

    return normalized;
  } catch {
    return [];
  }
}

function saveLibrary(library) {
  const normalized = normalizeLibrary(library);

  localStorage.setItem(
    "retrolink_library",
    JSON.stringify(normalized)
  );

  return normalized;
}

export default function useLibrary() {
  const [library, setLibrary] = useState(loadLibrary);

  const handleAddGame = async (game) => {
    try {
      const exePath = await window.retroLink?.selectGameExe();

      if (!exePath) return;

      const canonicalId = normalizeGameId(game.id ?? game.name);

      const updated = saveLibrary([
        ...library.filter(
          (savedGame) =>
            normalizeGameId(savedGame.id ?? savedGame.name) !==
            canonicalId
        ),
        {
          ...game,
          id: canonicalId,
          exePath,
        },
      ]);

      setLibrary(updated);
    } catch (error) {
      console.error("Error adding game:", error);
    }
  };

  const handleRemoveGame = (gameId) => {
    const canonicalId = normalizeGameId(gameId);

    const updated = saveLibrary(
      library.filter(
        (game) =>
          normalizeGameId(game.id ?? game.name) !== canonicalId
      )
    );

    setLibrary(updated);
  };

  return {
    library,
    setLibrary,
    handleAddGame,
    handleRemoveGame,
  };
}