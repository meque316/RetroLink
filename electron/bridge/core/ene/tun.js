// electron/bridge/core/ene/tun.js

const { TUN } = require('appium-ios-tuntap');
const os = require('os');

class TUNInterface {
  constructor(options = {}) {
    this.name = options.name || 'retrolink0';
    this.ip = options.ip || '10.0.0.1';
    this.netmask = options.netmask || '255.255.255.0';
    this.mtu = options.mtu || 1500;
    this.tun = null;
    this.isOpen = false;
  }

  create() {
    try {
      // Verificar si el sistema es Windows
      const isWindows = os.platform() === 'win32';
      
      // Crear la interfaz TUN
      this.tun = new TUN({
        name: this.name,
        ip: this.ip,
        netmask: this.netmask,
        mtu: this.mtu,
      });

      // En Windows, necesitamos abrir la interfaz
      this.tun.open();

      this.isOpen = true;
      console.log(`[ENE] ✅ Interfaz TUN creada: ${this.name} con IP ${this.ip}`);
      
      // En Windows, el driver de WinTun se instala automáticamente
      if (isWindows) {
        console.log('[ENE] ℹ️ WinTun driver instalado automáticamente (requiere admin)');
      }
      
      return true;
    } catch (error) {
      console.error('[ENE] ❌ Error creando interfaz TUN:', error);
      return false;
    }
  }

  // Enviar un paquete a través de la TUN
  send(packet) {
    if (!this.isOpen || !this.tun) {
      console.warn('[ENE] ⚠️ TUN no abierta, no se puede enviar paquete');
      return false;
    }
    
    try {
      this.tun.send(packet);
      return true;
    } catch (error) {
      console.error('[ENE] ❌ Error enviando paquete por TUN:', error);
      return false;
    }
  }

  // Escuchar paquetes entrantes
  onData(callback) {
    if (!this.isOpen || !this.tun) {
      console.warn('[ENE] ⚠️ TUN no abierta, no se puede escuchar');
      return;
    }
    
    this.tun.on('data', (packet) => {
      callback(packet);
    });
  }

  // Cerrar la interfaz
  close() {
    if (this.tun) {
      try {
        this.tun.close();
        this.isOpen = false;
        console.log('[ENE] 🛑 Interfaz TUN cerrada');
      } catch (error) {
        console.error('[ENE] ❌ Error cerrando TUN:', error);
      }
    }
  }
}

module.exports = { TUNInterface };