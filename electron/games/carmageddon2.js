// electron/games/carmageddon2.js
module.exports = {
  id: 'carmageddon2',
  name: 'Carmageddon II: Carpocalypse Now',
  defaultPort: 8055,  // Puerto UDP para CarmaNet
  clientPortBase: 8056,
  
  // Carmageddon 2 no necesita argumentos especiales
  // El usuario crea la partida desde el menú del juego
  getHostArgs(extraArgs = []) {
    return [...extraArgs];
  },
  
  getClientArgs(port, extraArgs = []) {
    return [...extraArgs];
  }
};