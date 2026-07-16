// electron/games/carmageddon2.js

module.exports = {
  id: "carmageddon2",
  name: "Carmageddon II: Carpocalypse Now",

  executable: "CARMA2_HW.EXE",

  /*
   * IPXWrapper utiliza un puerto UDP compartido
   * para broadcast y luego crea puertos privados
   * dinámicos para cada instancia.
   */
  defaultPort: 54792,
  clientPortBase: 54792,

  /*
   * El juego crea la partida desde su propio menú.
   */
  supportsRoomOptions: false,
  usesDedicatedServer: false,
  hostAlsoLaunchesClient: false,

  /*
   * Dejamos estas propiedades para mantener la misma
   * interfaz que el resto de juegos.
   */
  serverWarmupMs: 0,

  getHostArgs(extraArgs = []) {
    return [...extraArgs];
  },

  getClientArgs(port, extraArgs = []) {
    return [...extraArgs];
  },
};