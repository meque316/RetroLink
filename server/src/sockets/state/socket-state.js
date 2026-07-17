export const rooms = [];

export const readyStates =
  Object.create(null);

export const onlineUsers =
  Object.create(null);

export const userGames =
  Object.create(null);

/*
 * roomId -> Map<socketId, participant>
 */
export const gameRelayRooms =
  new Map();