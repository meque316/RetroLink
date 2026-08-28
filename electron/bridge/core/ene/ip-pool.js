// electron/bridge/core/ene/ip-pool.js

class IPPool {
  constructor(options = {}) {
    this.baseIP = options.baseIP || '10.0.0.';
    this.subnetMask = options.subnetMask || '255.255.255.0';
    this.nextIP = 1; // 10.0.0.1 para el host
    this.assignedIPs = new Map(); // peerId -> IP
  }

  // Asignar una IP al peer
  assign(peerId) {
    if (this.assignedIPs.has(peerId)) {
      return this.assignedIPs.get(peerId);
    }
    
    const ip = this.baseIP + this.nextIP;
    this.assignedIPs.set(peerId, ip);
    this.nextIP++;
    return ip;
  }

  // Liberar IP de un peer
  release(peerId) {
    if (this.assignedIPs.has(peerId)) {
      this.assignedIPs.delete(peerId);
      return true;
    }
    return false;
  }

  // Obtener la IP de un peer
  getIP(peerId) {
    return this.assignedIPs.get(peerId) || null;
  }

  // Obtener todas las IPs asignadas
  getAll() {
    return Array.from(this.assignedIPs.values());
  }
}

module.exports = { IPPool };