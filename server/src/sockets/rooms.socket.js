import {
  createUserSession,
  registerUserEvents,
} from "./users/user-events.js";

import {
  registerRoomEvents,
} from "./rooms/room-events.js";

import {
  registerWebRTCEvents,
} from "./webrtc/webrtc-events.js";

import {
  registerRelayEvents,
} from "./relay/relay-events.js";

import {
  handleDisconnect,
} from "./disconnect/disconnect-handler.js";

export default function roomsSocket(io) {
  io.on("connection", (socket) => {
    console.log(
      "Usuario conectado:",
      socket.id
    );

    const user = createUserSession({
      io,
      socket,
    });

    registerUserEvents({
      io,
      socket,
      user,
    });

    registerRoomEvents({
      io,
      socket,
      user,
    });

    registerWebRTCEvents({
      io,
      socket,
    });

    registerRelayEvents({
      io,
      socket,
    });

    socket.on("disconnect", () => {
      handleDisconnect({
        io,
        socket,
      });
    });
  });
}