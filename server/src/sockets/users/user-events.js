import {
  onlineUsers,
  rooms,
  userGames,
} from "../state/socket-state.js";

export function createUserSession({
  io,
  socket,
}) {
  const user = {
    username:
      socket.handshake.auth?.username ||
      `Player-${socket.id.slice(0, 5)}`,

    role:
      socket.handshake.auth?.role ||
      "USER",

    avatar:
      socket.handshake.auth?.avatar ||
      "",
  };

  onlineUsers[socket.id] = user;

  io.emit(
    "users-online",
    Object.values(onlineUsers)
  );

  socket.emit(
    "rooms-list",
    rooms
  );

  return user;
}

export function registerUserEvents({
  socket,
  user,
}) {
  socket.on("get-rooms", () => {
    socket.emit(
      "rooms-list",
      rooms
    );
  });

  socket.on(
    "get-users-online",
    () => {
      socket.emit(
        "users-online",
        Object.values(onlineUsers)
      );
    }
  );

  socket.on(
    "report-game-config",
    ({
      gameId,
      hasGame,
    } = {}) => {
      if (!gameId) {
        return;
      }

      if (!userGames[socket.id]) {
        userGames[socket.id] = {};
      }

      const value =
        Boolean(hasGame);

      userGames[socket.id][gameId] =
        value;

      if (
        typeof gameId === "string"
      ) {
        userGames[socket.id][
          gameId.toLowerCase()
        ] = value;
      }

      console.log(
        `[User] ${socket.id} (${user.username}) game ${gameId} configured: ${value}`
      );
    }
  );
}

export function removeUserSession({
  io,
  socket,
}) {
  delete userGames[socket.id];
  delete onlineUsers[socket.id];

  io.emit(
    "users-online",
    Object.values(onlineUsers)
  );
}