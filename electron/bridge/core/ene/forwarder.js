// electron/bridge/core/ene/forwarder.js

// Esta función parsea un paquete IP y extrae el payload UDP
// (para simplificar, asumimos que todo el tráfico a 6112 se reenvía directamente)
function extractUDPPayload(ipPacket) {
  // Versión simplificada: se necesita más lógica para parsear IP/UDP real
  // Por ahora, asumimos que el payload es UDP puro
  // (en producción, usar una librería como 'ip-packet' para parsear correctamente)
  return {
    destPort: 6112,
    payload: ipPacket
  };
}

// Construir un paquete IP/UDP desde un payload
function buildIPPacket(payload, srcIP, destIP, srcPort, destPort) {
  // Versión simplificada: se necesita construir el header IP y UDP
  // (en producción, usar una librería como 'ip-packet' para construir correctamente)
  return payload;
}

class PacketForwarder {
  constructor(tun, transportManager, ipPool) {
    this.tun = tun;
    this.transportManager = transportManager;
    this.ipPool = ipPool;
    this.peerIPs = new Map(); // peerId -> IP virtual
  }

  // Reenviar paquete de TUN a WebRTC
  forwardTUNToWebRTC(packet) {
    // Parsear el paquete IP para extraer el destino
    // (simplificado: asumimos que es UDP a 6112)
    const udpPacket = extractUDPPayload(packet);
    if (udpPacket && udpPacket.destPort === 6112) {
      this.transportManager.send(udpPacket.payload);
      return true;
    }
    return false;
  }

  // Reenviar paquete de WebRTC a TUN
  forwardWebRTCToTUN(packet, sourcePeerId) {
    // Obtener la IP virtual del peer de origen
    const srcIP = this.ipPool.getIP(sourcePeerId) || '10.0.0.2';
    // La IP de destino es siempre la IP virtual del host (10.0.0.1)
    const destIP = '10.0.0.1';
    
    // Construir paquete IP/UDP
    const ipPacket = buildIPPacket(packet, srcIP, destIP, 6112, 6112);
    this.tun.send(ipPacket);
    return true;
  }
}

module.exports = { PacketForwarder };