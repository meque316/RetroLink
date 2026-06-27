const { exec } = require("child_process");
const natUpnp = require("nat-upnp");
const dgram = require("dgram");

module.exports = {
  allowFirewall: (programPath, ruleName) => {
    if (!programPath) return;
    exec(`netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow program="${programPath}" enable=yes`,
      (err) => console.log(err ? `[FW] Rule check: ${ruleName}` : `[FW] Allowed: ${ruleName}`)
    );
  },

  checkPort: (port) => new Promise((resolve) => {
    const s = dgram.createSocket("udp4");
    s.bind(port, () => { s.close(); resolve(true); });
    s.on("error", () => resolve(false));
  }),

  openUPnP: (port) => new Promise((resolve) => {
    const c = natUpnp.createClient();
    c.portMapping({ public: port, private: port, protocol: "UDP", description: "RetroLink", ttl: 0 }, (err) => {
      c.close();
      resolve({ success: !err });
    });
  }),

  closeUPnP: (port) => new Promise((resolve) => {
    const c = natUpnp.createClient();
    c.portUnmapping({ public: port, protocol: "UDP" }, () => { c.close(); resolve(); });
  })
};