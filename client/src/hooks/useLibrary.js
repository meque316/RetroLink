import { useState } from "react";

function loadLibrary() {
  try {
    return JSON.parse(localStorage.getItem("retrolink_library") || "[]");
  } catch {
    return [];
  }
}

function saveLibrary(library) {
  localStorage.setItem("retrolink_library", JSON.stringify(library));
}

export default function useLibrary() {
  const [library, setLibrary] = useState(loadLibrary);

  const handleAddGame = async (game) => {
    try {
      const exePath = await window.retroLink?.selectGameExe();
      if (!exePath) return;

      const alreadyExists = library.some((g) => g.id === game.id);

      if (alreadyExists) {
        const updated = library.map((g) =>
          g.id === game.id ? { ...g, exePath } : g
        );

        setLibrary(updated);
        saveLibrary(updated);
      } else {
        const updated = [...library, { ...game, exePath }];

        setLibrary(updated);
        saveLibrary(updated);
      }
    } catch (error) {
      console.error("Error adding game:", error);
    }
  };

  const handleRemoveGame = (gameId) => {
    const updated = library.filter((g) => g.id !== gameId);

    setLibrary(updated);
    saveLibrary(updated);
  };

  return {
    library,
    setLibrary,
    handleAddGame,
    handleRemoveGame,
  };
}