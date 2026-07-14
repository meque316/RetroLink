const createGenericRelay = require("./relay-generic");

module.exports = createGenericRelay({
  label: "UT99",
  gamePort: 7777,
  clientPortBase: 7801,
  maxClients: 16,
  ordered: true,

  // Temporalmente activado para depuración.
  debugPackets: false,
});