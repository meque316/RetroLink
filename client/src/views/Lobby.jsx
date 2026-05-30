import React, { useEffect, useState } from "react";
import socket from "../socket";
import Room from "./Room";
import { Users, Wifi, Plus } from "lucide-react";

function Lobby() {
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);

  const friends = [
    "NeoPlayer",
    "CyberFox",
    "RetroWolf",
    "PixelGhost",
  ];

  useEffect(() => {
    const handleRoomsList = (updatedRooms) => {
      setRooms(updatedRooms);

      setCurrentRoom((prevRoom) => {
        if (!prevRoom) return null;

        const updatedRoom = updatedRooms.find(
          (room) => room.id === prevRoom.id
        );

        return updatedRoom || null;
      });
    };

    socket.on("rooms-list", handleRoomsList);

    /*
      fuerza pedir rooms al entrar al lobby
    */
    socket.emit("get-rooms");

    return () => {
      socket.off("rooms-list", handleRoomsList);
    };
  }, []);

  const joinRoom = (room) => {
    socket.emit("join-room", room.id);
    setCurrentRoom(room);

    console.log("Joined room:", room.id);
  };

  const createRoom = () => {
    socket.emit("create-room", {
      name: "Quake Lobby",
      game: "Quake 3 Arena",
    });

    console.log("Creating room...");
  };

  const leaveRoom = () => {
    if (currentRoom) {
      socket.emit("leave-room", currentRoom.id);
    }

    setCurrentRoom(null);
  };

  if (currentRoom) {
    return (
      <Room
        room={currentRoom}
        leaveRoom={leaveRoom}
      />
    );
  }

  return (
    <div className="h-full bg-[#0b0f14] text-white flex">
      {/* SIDEBAR */}
      <aside className="w-64 border-r border-zinc-800 bg-[#0d1117] p-6 flex flex-col">
        <h1 className="text-2xl font-bold text-green-400 mb-10 tracking-wide">
          RETROLINK
        </h1>

        <nav className="space-y-4">
          <button className="w-full text-left px-4 py-3 rounded-xl bg-green-500/10 text-green-400">
            Lobby
          </button>

          <button className="w-full text-left px-4 py-3 rounded-xl hover:bg-zinc-800 transition">
            Library
          </button>

          <button className="w-full text-left px-4 py-3 rounded-xl hover:bg-zinc-800 transition">
            Friends
          </button>
        </nav>
      </aside>

      {/* MAIN */}
      <main className="flex-1 p-8 overflow-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-semibold">
              Game Rooms
            </h2>

            <p className="text-zinc-400 mt-1">
              Join or host retro multiplayer sessions
            </p>
          </div>

          <button
            onClick={createRoom}
            className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-black px-5 py-3 rounded-xl font-semibold transition"
          >
            <Plus size={18} />
            Create Room
          </button>
        </div>

        {/* ROOM LIST */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {rooms.length === 0 ? (
            <p className="text-zinc-500">
              No active rooms. Create one 🚀
            </p>
          ) : (
            rooms.map((room) => (
              <div
                key={room.id}
                className="bg-[#121821] border border-zinc-800 rounded-2xl p-6 hover:border-green-500 transition"
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-semibold">
                    {room.name}
                  </h3>

                  <span className="text-green-400 text-sm">
                    Open
                  </span>
                </div>

                <div className="flex gap-6 text-zinc-400 text-sm mb-4">
                  <div className="flex items-center gap-2">
                    <Users size={16} />
                    {room.players} player(s)
                  </div>

                  <div className="flex items-center gap-2">
                    <Wifi size={16} />
                    P2P Ready
                  </div>
                </div>

                <button
                  onClick={() => joinRoom(room)}
                  className="w-full bg-zinc-800 hover:bg-green-500 hover:text-black transition rounded-xl py-3 font-medium"
                >
                  Join Room
                </button>
              </div>
            ))
          )}
        </div>
      </main>

      {/* RIGHT PANEL */}
      <aside className="w-72 border-l border-zinc-800 bg-[#0d1117] p-6">
        <h3 className="text-lg font-semibold mb-6">
          Friends Online
        </h3>

        <div className="space-y-4">
          {friends.map((friend) => (
            <div
              key={friend}
              className="flex items-center justify-between bg-[#121821] rounded-xl px-4 py-3"
            >
              <span>{friend}</span>

              <div className="w-3 h-3 rounded-full bg-green-400" />
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

export default Lobby;