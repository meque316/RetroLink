import { useEffect, useState } from "react";
import socket from "../socket";

const GAME_ID_ALIASES = {
  quake3: "quake3",
  "quake iii arena": "quake3",

  cs16: "cs16",
  "counter-strike 1.6": "cs16",

  ut99: "ut99",
  "unreal tournament": "ut99",
  "unreal tournament '99": "ut99",
  "unreal tournament 99": "ut99",

  carmageddon2: "carmageddon2",
  "carmageddon 2": "carmageddon2",
  "carmageddon ii": "carmageddon2",
  "carmageddon ii: carpocalypse now": "carmageddon2",
};

function normalizeGameId(value) {
  if (!value) return "";

  const normalized = String(value)
    .trim()
    .toLowerCase();

  return GAME_ID_ALIASES[normalized] ?? normalized;
}

function loadLibrary() {
  try {
    const stored = JSON.parse(
      localStorage.getItem("retrolink_library") || "[]"
    );

    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    console.error("[useGamePath] Error loading library:", error);
    return [];
  }
}

function saveLibrary(library) {
  localStorage.setItem(
    "retrolink_library",
    JSON.stringify(library)
  );
}

function getGamePathFromLibrary(gameId) {
  const canonicalId = normalizeGameId(gameId);
  const library = loadLibrary();

  const saved = library.find(
    (game) =>
      normalizeGameId(game.id ?? game.name) === canonicalId
  );

  return saved?.exePath || "";
}

function reportConfiguredGames() {
  try {
    const library = loadLibrary();
    const reportedIds = new Set();

    library.forEach((game) => {
      const canonicalId = normalizeGameId(
        game.id ?? game.name
      );

      if (!canonicalId || reportedIds.has(canonicalId)) {
        return;
      }

      reportedIds.add(canonicalId);

      socket.emit("report-game-config", {
        gameId: canonicalId,
        hasGame: Boolean(game.exePath),
      });
    });
  } catch (error) {
    console.error(
      "[useGamePath] Error reporting games:",
      error
    );
  }
}

export default function useGamePath(room) {
  const roomGameId = normalizeGameId(room?.game);

  const [gamePath, setGamePath] = useState(() =>
    getGamePathFromLibrary(roomGameId)
  );

  useEffect(() => {
    // Importante: actualiza la ruta cuando se entra a otra sala.
    setGamePath(getGamePathFromLibrary(roomGameId));
    reportConfiguredGames();

    const handleStorageChange = (event) => {
      if (event.key !== "retrolink_library") return;

      reportConfiguredGames();
      setGamePath(
        getGamePathFromLibrary(roomGameId)
      );
    };

    window.addEventListener(
      "storage",
      handleStorageChange
    );

    return () => {
      window.removeEventListener(
        "storage",
        handleStorageChange
      );
    };
  }, [roomGameId]);

  const handleBrowseGame = async () => {
    try {
      const selectedPath =
        await window.retroLink?.selectGameExe();

      if (!selectedPath) return;

      const library = loadLibrary();

      const existingIndex = library.findIndex(
        (game) =>
          normalizeGameId(game.id ?? game.name) ===
          roomGameId
      );

      let updatedLibrary;

      if (existingIndex >= 0) {
        updatedLibrary = library.map((game, index) =>
          index === existingIndex
            ? {
                ...game,
                id: roomGameId,
                exePath: selectedPath,
              }
            : game
        );
      } else {
        updatedLibrary = [
          ...library,
          {
            id: roomGameId,
            name: room?.game || roomGameId,
            exePath: selectedPath,
          },
        ];
      }

      saveLibrary(updatedLibrary);
      setGamePath(selectedPath);

      socket.emit("report-game-config", {
        gameId: roomGameId,
        hasGame: true,
      });
    } catch (error) {
      console.error(
        "[useGamePath] Error selecting exe:",
        error
      );
    }
  };

  return {
    gamePath,
    setGamePath,
    handleBrowseGame,
  };
}