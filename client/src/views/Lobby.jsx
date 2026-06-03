import React, { useEffect, useState } from "react";
import socket, { connectSocket } from "../socket";
import Room from "./Room";
import {
  Users,
  Wifi,
  Plus,
  Crown,
  Gamepad2,
  LogOut,
  Camera,
  X,
} from "lucide-react";

const CLOUDINARY_CLOUD_NAME = "davmgvs7u";
const CLOUDINARY_UPLOAD_PRESET = "retrolink_avatars";

const GAMES = [
  { id: "quake3",   name: "Quake III Arena",        year: "1999" },
  { id: "quake2",   name: "Quake II",                year: "1997" },
  { id: "quake1",   name: "Quake",                   year: "1996" },
  { id: "ut99",     name: "Unreal Tournament",       year: "1999" },
  { id: "ut2004",   name: "Unreal Tournament 2004",  year: "2004" },
  { id: "cs16",     name: "Counter-Strike 1.6",      year: "2000" },
  { id: "hl1",      name: "Half-Life",               year: "1998" },
  { id: "doom2",    name: "Doom II",                 year: "1994" },
];

function Lobby() {
  const [rooms, setRooms] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  /*
  MODAL STATE
  */
  const [showModal, setShowModal] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [selectedGame, setSelectedGame] = useState(GAMES[0]);

  useEffect(() => {
    connectSocket();

    const savedUser = localStorage.getItem("user");
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setCurrentUser(parsedUser);
      } catch (error) {
        console.error("Error parsing user:", error);
      }
    }

    const handleRoomsList = (updatedRooms) => {
      setRooms(updatedRooms);
      setCurrentRoom((prevRoom) => {
        if (!prevRoom) return null;
        const updatedRoom = updatedRooms.find((room) => room.id === prevRoom.id);
        return updatedRoom || null;
      });
    };

    const handleUsersOnline = (users) => setOnlineUsers(users);

    socket.on("rooms-list", handleRoomsList);
    socket.on("users-online", handleUsersOnline);
    socket.emit("get-rooms");
    socket.emit("get-users-online");

    return () => {
      socket.off("rooms-list", handleRoomsList);
      socket.off("users-online", handleUsersOnline);
    };
  }, []);

  const joinRoom = (room) => {
    socket.emit("join-room", room.id);
    setCurrentRoom(room);
  };

  const createRoom = async () => {
    const name = roomName.trim() || `${currentUser?.username}'s Room`;

    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const data = await response.json();
      socket.emit("create-room", {
        name,
        game: selectedGame.name,
        gameId: selectedGame.id,
        hostPublicIp: data.ip,
      });
    } catch {
      socket.emit("create-room", {
        name,
        game: selectedGame.name,
        gameId: selectedGame.id,
        hostPublicIp: null,
      });
    }

    setShowModal(false);
    setRoomName("");
    setSelectedGame(GAMES[0]);
  };

  const leaveRoom = () => {
    if (currentRoom) socket.emit("leave-room", currentRoom.id);
    setCurrentRoom(null);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    socket.disconnect();
    window.location.reload();
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingAvatar(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

      const cloudRes = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: "POST", body: formData }
      );

      const cloudData = await cloudRes.json();
      const avatarUrl = cloudData.secure_url;

      const token = localStorage.getItem("token");
      await fetch("https://retrolink-server.onrender.com/api/user/avatar", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ avatarUrl }),
      });

      const updatedUser = { ...currentUser, avatar: avatarUrl };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setCurrentUser(updatedUser);
    } catch (error) {
      console.error("Error uploading avatar:", error);
      alert("Error al subir el avatar");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const Avatar = ({ user, size = "md" }) => {
    const dimensions = size === "md" ? "w-12 h-12 text-lg" : "w-10 h-10 text-sm";
    const isAdmin = user.role === "ADMIN";

    if (user.avatar) {
      return (
        <img
          src={user.avatar}
          alt={user.username}
          className={`${dimensions} rounded-full object-cover`}
        />
      );
    }

    return (
      <div className={`${dimensions} rounded-full flex items-center justify-center font-bold ${
        isAdmin ? "bg-yellow-500/10 text-yellow-400" : "bg-green-500/10 text-green-400"
      }`}>
        {user.username?.charAt(0)?.toUpperCase()}
      </div>
    );
  };

  if (currentRoom) {
    return <Room room={currentRoom} leaveRoom={leaveRoom} />;
  }

  return (
    <div className="h-full bg-[#0b0f14] text-white flex">

      {/* MODAL CREAR ROOM */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#121821] border border-zinc-800 rounded-3xl p-8 w-full max-w-lg">

            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Host a Match</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-zinc-500 hover:text-white transition"
              >
                <X size={22} />
              </button>
            </div>

            {/* ROOM NAME */}
            <div className="mb-6">
              <label className="text-sm text-zinc-400 mb-2 block">
                Room name
              </label>
              <input
                type="text"
                placeholder={`${currentUser?.username}'s Room`}
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="w-full bg-zinc-900 px-4 py-3 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>

            {/* GAME SELECTOR */}
            <div className="mb-8">
              <label className="text-sm text-zinc-400 mb-2 block">
                Select game
              </label>
              <div className="grid grid-cols-2 gap-2">
                {GAMES.map((game) => (
                  <button
                    key={game.id}
                    onClick={() => setSelectedGame(game)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition text-left ${
                      selectedGame.id === game.id
                        ? "border-green-500 bg-green-500/10 text-green-400"
                        : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
                    }`}
                  >
                    <Gamepad2 size={16} className="shrink-0" />
                    <div>
                      <p className="text-sm font-medium leading-tight">{game.name}</p>
                      <p className="text-xs text-zinc-500">{game.year}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* CREAR */}
            <button
              onClick={createRoom}
              className="w-full bg-green-500 hover:bg-green-400 text-black py-3 rounded-xl font-semibold transition"
            >
              Create Room
            </button>
          </div>
        </div>
      )}

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

        <div className="mt-auto">
          <button
            onClick={logout}
            className="w-full text-left px-4 py-3 rounded-xl hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition flex items-center gap-2"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 p-8 overflow-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-semibold">Game Rooms</h2>
            <p className="text-zinc-400 mt-1">
              Join or host retro multiplayer sessions
            </p>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-black px-5 py-3 rounded-xl font-semibold transition"
          >
            <Plus size={18} />
            Host Match
          </button>
        </div>

        {/* ROOM LIST */}
        <div className="space-y-5">
          {rooms.length === 0 ? (
            <div className="bg-[#11161d] border border-zinc-800 rounded-2xl p-10 text-center text-zinc-500">
              No active rooms. Create one 🚀
            </div>
          ) : (
            rooms.map((room) => (
              <div
                key={room.id}
                className="bg-[#11161d] border border-zinc-800 rounded-2xl p-5 hover:border-green-500 transition flex items-center justify-between gap-6"
              >
                <div className="flex items-center gap-5">
                  <div className="w-24 h-24 rounded-xl bg-gradient-to-br from-green-500/20 to-zinc-900 border border-zinc-700 flex items-center justify-center text-green-400">
                    <Gamepad2 size={34} />
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold">{room.name}</h3>

                    <span className="inline-block mt-2 text-xs px-3 py-1 rounded-full bg-green-500/10 text-green-400">
                      {room.game}
                    </span>

                    <div className="flex gap-6 text-zinc-400 text-sm mt-4">
                      <div className="flex items-center gap-2">
                        <Users size={16} />
                        {room.players} player(s)
                      </div>
                      <div className="flex items-center gap-2">
                        <Wifi size={16} />
                        P2P Ready
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => joinRoom(room)}
                  className="bg-green-500 hover:bg-green-400 text-black px-5 py-2 rounded-xl font-semibold transition"
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

        {currentUser && (
          <div className="mb-8 bg-[#121821] rounded-2xl p-4 border border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="relative group">
                <Avatar user={currentUser} size="md" />
                <label className={`absolute inset-0 rounded-full flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition cursor-pointer ${uploadingAvatar ? "opacity-100" : ""}`}>
                  {uploadingAvatar ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Camera size={14} className="text-white" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                    disabled={uploadingAvatar}
                  />
                </label>
              </div>

              <div>
                <p className="font-semibold flex items-center gap-2">
                  {currentUser.username}
                  {currentUser.role === "ADMIN" && (
                    <Crown size={16} className="text-yellow-400" />
                  )}
                </p>
                <p className="text-sm text-zinc-400 capitalize">
                  {currentUser.role?.toLowerCase()}
                </p>
              </div>
            </div>
          </div>
        )}

        <h3 className="text-lg font-semibold mb-6">
          Players Online ({onlineUsers.length})
        </h3>

        <div className="space-y-4">
          {onlineUsers.length === 0 ? (
            <p className="text-zinc-500 text-sm">No users online</p>
          ) : (
            onlineUsers.map((user, index) => {
              const isAdmin = user.role === "ADMIN";
              return (
                <div
                  key={index}
                  className="flex items-center gap-3 bg-[#121821] rounded-xl px-4 py-3"
                >
                  <Avatar user={user} size="sm" />

                  <div className="flex-1">
                    <p className={`font-medium flex items-center gap-1 ${isAdmin ? "text-yellow-400" : "text-white"}`}>
                      {user.username}
                      {isAdmin && <Crown size={13} className="text-yellow-400" />}
                    </p>
                    <p className="text-xs text-zinc-400 capitalize">
                      {user.role?.toLowerCase()}
                    </p>
                  </div>

                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}

export default Lobby;



