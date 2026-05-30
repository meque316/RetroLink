import React, { useEffect, useState } from "react";
import socket from "../socket";
import {
  Crown,
  Users,
  Play,
  LogOut,
} from "lucide-react";

function Room({ room, leaveRoom }) {
  const [currentRoom, setCurrentRoom] =
    useState(room);

  const [readyPlayers, setReadyPlayers] =
    useState([]);

  const [gamePath, setGamePath] =
    useState("");

  /*
  SOCKET EVENTS
  */
  useEffect(() => {
    socket.emit("get-rooms");

    const handleRoomsList = (rooms) => {
      const updatedRoom = rooms.find(
        (r) => r.id === room.id
      );

      if (!updatedRoom) {
        leaveRoom();
        return;
      }

      setCurrentRoom(updatedRoom);
    };

    const handleReadyState = (
      playersReady
    ) => {
      setReadyPlayers(playersReady);
    };

    const handleMatchStarted =
  async () => {
    console.log(
      "La partida comenzó 🚀"
    );

    if (!gamePath) return;

    try {
      await window.retroLink.launchGame(
        gamePath
      );
    } catch (error) {
      console.error(
        "Error launching game:",
        error
      );
    }
  };

    const handleMatchError = (
      error
    ) => {
      alert(error.message);
    };

    socket.on(
      "rooms-list",
      handleRoomsList
    );

    socket.on(
      "room-ready-state",
      handleReadyState
    );

    socket.on(
      "match-started",
      handleMatchStarted
    );

    socket.on(
      "match-error",
      handleMatchError
    );

    return () => {
      socket.off(
        "rooms-list",
        handleRoomsList
      );

      socket.off(
        "room-ready-state",
        handleReadyState
      );

      socket.off(
        "match-started",
        handleMatchStarted
      );

      socket.off(
        "match-error",
        handleMatchError
      );
    };
  }, [room.id, leaveRoom]);

  /*
  BROWSE GAME EXE
  */
  const handleBrowseGame =
    async () => {
      try {
        const selectedPath =
          await window.retroLink?.selectGameExe();

        if (selectedPath) {
          setGamePath(
            selectedPath
          );
        }
      } catch (error) {
        console.error(
          "Error selecting exe:",
          error
        );
      }
    };

  const handleLeave = () => {
    socket.emit(
      "leave-room",
      room.id
    );

    leaveRoom();
  };

  const toggleReady = () => {
    socket.emit(
      "toggle-ready",
      room.id
    );
  };

  const startMatch = () => {
    socket.emit(
      "start-match",
      room.id
    );
  };

  const isHost =
    currentRoom?.host === socket.id;

  const isReady =
    readyPlayers.includes(socket.id);

  return (
    <div className="h-full bg-[#0b0f14] text-white flex items-center justify-center p-8">
      <div className="w-full max-w-3xl bg-[#121821] rounded-3xl border border-zinc-800 p-8">

        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold">
              {currentRoom?.name}
            </h1>

            <p className="text-zinc-400 mt-2">
              Waiting for players...
            </p>
          </div>

          <button
            onClick={handleLeave}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-red-500 px-4 py-2 rounded-xl transition"
          >
            <LogOut size={16} />
            Leave
          </button>
        </div>

        <div className="space-y-4 mb-8">
          {currentRoom?.members?.map(
            (memberId, index) => {
              const ready =
                readyPlayers.includes(
                  memberId
                );

              const host =
                memberId ===
                currentRoom.host;

              return (
                <div
                  key={memberId}
                  className="bg-[#0d1117] rounded-2xl px-5 py-4 flex justify-between items-center"
                >
                  <div className="flex items-center gap-3">
                    <Users size={18} />

                    <span>
                      Player {index + 1}
                    </span>

                    {host && (
                      <Crown
                        size={16}
                        className="text-yellow-400"
                      />
                    )}
                  </div>

                  <span
                    className={`text-sm font-medium ${
                      ready
                        ? "text-green-400"
                        : "text-zinc-500"
                    }`}
                  >
                    {ready
                      ? "Ready"
                      : "Not Ready"}
                  </span>
                </div>
              );
            }
          )}
        </div>

        <div className="bg-[#0d1117] rounded-2xl p-5 mb-8 border border-zinc-800">
          <h2 className="text-lg font-semibold mb-2">
            Quake III Arena
          </h2>

          <p className="text-sm text-zinc-400 mb-3">
            Executable Path
          </p>

          {gamePath ? (
            <>
              <p className="text-green-400 text-sm break-all mb-2">
                {gamePath}
              </p>

              <p className="text-xs text-green-500">
                ✓ Ready to launch
              </p>
            </>
          ) : (
            <p className="text-yellow-400 text-sm mb-3">
              Executable not configured
            </p>
          )}

          <button
            onClick={handleBrowseGame}
            className="mt-4 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition"
          >
            Browse
          </button>
        </div>

        <div className="flex gap-4">
          <button
            onClick={toggleReady}
            className={`flex-1 py-3 rounded-2xl font-semibold transition ${
              isReady
                ? "bg-green-500 hover:bg-green-600"
                : "bg-zinc-800 hover:bg-zinc-700"
            }`}
          >
            {isReady
              ? "Ready ✓"
              : "Ready Up"}
          </button>

          {isHost && (
            <button
              onClick={startMatch}
              className="flex items-center justify-center gap-2 flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 font-semibold transition"
            >
              <Play size={18} />
              Start Match
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

export default Room;