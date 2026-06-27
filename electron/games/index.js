const quake3 = require("./quake3");
const cs16 = require("./cs16");

const gamesRegistry = {
  [quake3.id]: quake3,
  [cs16.id]: cs16
};

module.exports = {
  getGame: (gameId) => gamesRegistry[gameId] || null,
  listGames: () => Object.keys(gamesRegistry)
};