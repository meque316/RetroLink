import { useEffect, useState } from "react";
import socket from "../socket";

function getGamePathFromLibrary(gameId) {
  try {
    const library = JSON.parse(
      localStorage.getItem("retrolink_library") || "[]"
    );

    const saved = library.find((game) => game.id === gameId);
    return saved?.exePath || "";
  } catch {
    return "";
  }
}

function reportConfiguredGames() {
  try {
    const library = JSON.parse(
      localStorage.getItem("retrolink_library") || "[]"
    );

    library.forEach((game) => {
      socket.emit("report-game-config", {
        gameId: game.id,
        hasGame: !!game.exePath,
      });
    });
  } catch (error) {
    console.error("[useGamePath] Error reporting games:", error);
  }
}

export default function useGamePath(room) {
  const [gamePath, setGamePath] = useState(() =>
    getGamePathFromLibrary(room.game)
  );

  useEffect(() => {
    reportConfiguredGames();

    const handleStorageChange = (event) => {
      if (event.key === "retrolink_library") {
        reportConfiguredGames();
        setGamePath(getGamePathFromLibrary(room.game));
      }
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [room.game]);

  const handleBrowseGame = async () => {
    try {
      const selectedPath = await window.retroLink?.selectGameExe();

      if (!selectedPath) return;

      setGamePath(selectedPath);

      try {
        const library = JSON.parse(
          localStorage.getItem("retrolink_library") || "[]"
        );

        const existing = library.find((game) => game.id === room.game);

        if (existing) {
          existing.exePath = selectedPath;
        } else {
          library.push({
            id: room.game,
            exePath: selectedPath,
          });
        }

        localStorage.setItem("retrolink_library", JSON.stringify(library));

        socket.emit("report-game-config", {
          gameId: room.game,
          hasGame: true,
        });
      } catch (error) {
        console.error("[useGamePath] Error saving game path:", error);
      }
    } catch (error) {
      console.error("[useGamePath] Error selecting exe:", error);
    }
  };

  return {
    gamePath,
    setGamePath,
    handleBrowseGame,
  };
}