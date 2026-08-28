// electron/bridge/core/ene/index.js
// Módulo principal de Exodus Network Engine (ENE)
// Gestión de la red virtual TUN/TAP y forwarding de paquetes entre TUN y WebRTC

const { TUN } = require('appium-ios-tuntap');
const dgram = require('dgram');
const EventEmitter = require('events');

// ============================================================
// CONSTANTES
// ============================================================

const NETWORK = '10.0.0.0';
const NETMASK = '255.255.255.0';
const HOST_IP = '10.0.0.1';
const POOL_START = 2; // Las IPs 10.0.0.2 en adelante para clientes
const MTU = 1500;

// ============================================================
// CLASE PRINCIPAL
// ============================================================

class ENE extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      name: options.name || 'retrolink0',
      ip: options.ip || HOST_IP,
      netmask: options.netmask || NETMASK,
      mtu: options.mtu || MTU,
      ...options,
    };

    this.tun = null;
    this.pool = [];
    this.peers = new Map(); // peerId -> { ip, transportManager, websocket? }
    this.isRunning = false;
    this.forwardingRules = [];

    console.log('[ENE] 🚀 Inicializado');
  }

  // ============================================================
  // INICIO / DETENCIÓN
  // ============================================================

  /**
   * Inicia el motor ENE: crea la interfaz TUN y asigna IPs
   */
  start() {
    if (this.isRunning) {
      console.warn('[ENE] ⚠️ Ya está en ejecución');
      return;
    }

    try {
      console.log('[ENE] 🔧 Creando interfaz TUN...');

      // Crear la interfaz TUN
      this.tun = new TUN({
        name: this.options.name,
        ip: this.options.ip,
        netmask: this.options.netmask,
        mtu: this.options.mtu,
      });

      // Abrir la interfaz
      this.tun.open();

      // Asignar IP del host (10.0.0.1)
      this.tun.setIp(this.options.ip);

      // Verificar estado
      const status = this.tun.getStatus();
      console.log(`[ENE] ✅ Interfaz TUN creada: ${status.name} (${status.ip})`);

      // Escuchar paquetes entrantes
      this.tun.on('data', (packet) => {
        this._handleTUNPacket(packet);
      });

      // Eventos de estado
      this.tun.on('close', () => {
        console.log('[ENE] 🔒 Interfaz TUN cerrada');
        this.isRunning = false;
        this.emit('closed');
      });

      this.isRunning = true;
      this.emit('ready', { ip: this.options.ip });

      console.log('[ENE] 🟢 ENE listo para reenviar paquetes');
      return true;

    } catch (error) {
      console.error('[ENE] ❌ Error iniciando ENE:', error.message);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Detiene el motor ENE
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('[ENE] 🛑 Deteniendo ENE...');

    try {
      // Limpiar peers
      this.peers.clear();

      // Cerrar TUN
      if (this.tun) {
        this.tun.close();
        this.tun = null;
      }

      this.isRunning = false;
      this.emit('stopped');
      console.log('[ENE] 🛑 ENE detenido');

    } catch (error) {
      console.error('[ENE] ❌ Error deteniendo ENE:', error.message);
    }
  }

  /**
   * Verifica si ENE está corriendo
   */
  isRunning() {
    return this.isRunning;
  }

  // ============================================================
  // GESTIÓN DE PEERS
  // ============================================================

  /**
   * Asigna una IP virtual a un peer (cliente)
   * @param {string} peerId - ID del peer (socketId)
   * @param {Object} transportManager - TransportManager del peer
   * @returns {Object} { ip, success }
   */
  assignPeer(peerId, transportManager) {
    if (this.peers.has(peerId)) {
      console.warn(`[ENE] ⚠️ Peer ${peerId} ya asignado`);
      return { success: false, error: 'Peer already assigned' };
    }

    // Calcular siguiente IP disponible
    const nextIP = this._getNextAvailableIP();
    if (!nextIP) {
      console.error('[ENE] ❌ No hay IPs disponibles en el pool');
      return { success: false, error: 'No IPs available' };
    }

    this.peers.set(peerId, {
      ip: nextIP,
      transportManager: transportManager,
      assignedAt: Date.now(),
    });

    console.log(`[ENE] 👤 Peer ${peerId} asignado a ${nextIP}`);

    return { success: true, ip: nextIP };
  }

  /**
   * Libera la IP de un peer
   */
  releasePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) {
      return;
    }

    console.log(`[ENE] 👋 Liberando peer ${peerId} (${peer.ip})`);
    this.peers.delete(peerId);
  }

  /**
   * Obtiene la IP virtual de un peer
   */
  getPeerIP(peerId) {
    const peer = this.peers.get(peerId);
    return peer ? peer.ip : null;
  }

  // ============================================================
  // REENVÍO DE PAQUETES
  // ============================================================

  /**
   * Envía un paquete a través de la TUN a un destino
   * @param {Buffer} packet - Paquete IP completo
   * @param {string} destinationIP - IP de destino
   */
  sendToTUN(packet, destinationIP) {
    if (!this.isRunning || !this.tun) {
      return false;
    }

    try {
      // Inyectar el paquete en la TUN (se enruta automáticamente)
      this.tun.send(packet);
      return true;
    } catch (error) {
      console.error('[ENE] ❌ Error enviando a TUN:', error.message);
      return false;
    }
  }

  /**
   * Maneja paquetes recibidos desde la TUN
   * @private
   */
  _handleTUNPacket(packet) {
    // Analizar el paquete IP para extraer la información de destino
    // Esto es simplificado; en implementación completa se necesita
    // parsear cabeceras IP + UDP para extraer payload y destino

    // Extraer dirección IP de destino (los primeros 16 bytes de la cabecera)
    // Versión simplificada: asumimos que el payload es UDP hacia 6112
    try {
      // 1. Extraer IP de destino (bytes 16-19 de la cabecera IP)
      const destIP = this._extractDestinationIP(packet);

      // 2. Extraer puerto UDP de destino (bytes 2-3 del header UDP)
      const destPort = this._extractUDPDestinationPort(packet);

      // 3. Extraer payload UDP (después del header UDP)
      const payload = this._extractUDPPayload(packet);

      if (!destIP || !destPort || !payload) {
        // No es un paquete UDP válido, ignorar
        return;
      }

      // 4. Buscar a qué peer pertenece esa IP de destino
      const targetPeer = this._findPeerByIP(destIP);

      if (targetPeer && targetPeer.transportManager) {
        // Reenviar el payload al peer correspondiente
        targetPeer.transportManager.send(payload);
        console.log(`[ENE] 📤 Reenviando ${payload.length} bytes a ${destIP}:${destPort}`);
      } else if (destIP === this.options.ip) {
        // Es para el host local (10.0.0.1), inyectar en el juego local
        this.emit('local-packet', {
          packet,
          payload,
          destPort,
        });
      } else {
        console.warn(`[ENE] ⚠️ Destino desconocido: ${destIP}:${destPort}`);
      }

    } catch (error) {
      console.error('[ENE] ❌ Error procesando paquete:', error.message);
    }
  }

  /**
   * Inyecta un paquete en la red local (desde WebRTC hacia el juego)
   * @param {Buffer} payload - Payload UDP
   * @param {string} sourceIP - IP de origen (del peer)
   * @param {number} sourcePort - Puerto de origen
   * @param {number} destPort - Puerto de destino (6112)
   */
  injectFromWebRTC(payload, sourceIP, sourcePort, destPort = 6112) {
    if (!this.isRunning || !this.tun) {
      return false;
    }

    try {
      // Construir paquete UDP/IP completo para inyectarlo en la TUN
      // El sistema operativo enrutará este paquete hacia el juego
      const packet = this._buildIPPacket(payload, sourceIP, sourcePort, this.options.ip, destPort);
      this.tun.send(packet);
      return true;
    } catch (error) {
      console.error('[ENE] ❌ Error inyectando paquete:', error.message);
      return false;
    }
  }

  // ============================================================
  // UTILIDADES
  // ============================================================

  /**
   * Obtiene la siguiente IP disponible en el pool
   * @private
   */
  _getNextAvailableIP() {
    const usedIPs = new Set();
    for (const peer of this.peers.values()) {
      usedIPs.add(peer.ip);
    }

    let ip = POOL_START;
    while (ip < 255) {
      const candidate = `10.0.0.${ip}`;
      if (!usedIPs.has(candidate)) {
        return candidate;
      }
      ip++;
    }

    return null;
  }

  /**
   * Busca un peer por su IP virtual
   * @private
   */
  _findPeerByIP(ip) {
    for (const [peerId, peer] of this.peers) {
      if (peer.ip === ip) {
        return { ...peer, id: peerId };
      }
    }
    return null;
  }

  /**
   * Extrae IP de destino de un paquete IP
   * @private
   */
  _extractDestinationIP(packet) {
    if (packet.length < 20) {
      return null;
    }
    // Los bytes 16-19 del header IP contienen la IP de destino
    const ip = packet.slice(16, 20);
    return `${ip[0]}.${ip[1]}.${ip[2]}.${ip[3]}`;
  }

  /**
   * Extrae puerto UDP de destino
   * @private
   */
  _extractUDPDestinationPort(packet) {
    // El header IP tiene longitud variable, pero asumimos 20 bytes
    const ipHeaderLen = 20;
    if (packet.length < ipHeaderLen + 4) {
      return null;
    }
    // Puertos UDP están en bytes 2-3 del header UDP (después de IP)
    const port = packet.readUInt16BE(ipHeaderLen + 2);
    return port;
  }

  /**
   * Extrae payload UDP
   * @private
   */
  _extractUDPPayload(packet) {
    const ipHeaderLen = 20;
    const udpHeaderLen = 8;
    const totalHeader = ipHeaderLen + udpHeaderLen;
    if (packet.length <= totalHeader) {
      return null;
    }
    return packet.slice(totalHeader);
  }

  /**
   * Construye un paquete IP/UDP para inyectar en la TUN
   * @private
   */
  _buildIPPacket(payload, sourceIP, sourcePort, destIP, destPort) {
    // Esta es una implementación simplificada
    // En producción, usar una librería como 'ip-packet' o 'sockaddr'
    // para construir paquetes correctamente

    const ipHeader = Buffer.alloc(20);
    const udpHeader = Buffer.alloc(8);
    const totalLength = 20 + 8 + payload.length;

    // Cabecera IP (simplificada, IPv4)
    ipHeader[0] = 0x45; // IPv4, 20 bytes header
    ipHeader[1] = 0x00;
    ipHeader.writeUInt16BE(totalLength, 2);
    ipHeader[4] = 0x00; // TTL
    ipHeader[5] = 0x11; // Protocolo UDP
    // Checksum = 0 (simplificado)
    // IP origen
    const srcParts = sourceIP.split('.').map(Number);
    ipHeader[12] = srcParts[0];
    ipHeader[13] = srcParts[1];
    ipHeader[14] = srcParts[2];
    ipHeader[15] = srcParts[3];
    // IP destino
    const dstParts = destIP.split('.').map(Number);
    ipHeader[16] = dstParts[0];
    ipHeader[17] = dstParts[1];
    ipHeader[18] = dstParts[2];
    ipHeader[19] = dstParts[3];

    // Cabecera UDP
    udpHeader.writeUInt16BE(sourcePort, 0);
    udpHeader.writeUInt16BE(destPort, 2);
    udpHeader.writeUInt16BE(8 + payload.length, 4);
    udpHeader[6] = 0x00;
    udpHeader[7] = 0x00;

    // Paquete completo
    return Buffer.concat([ipHeader, udpHeader, payload]);
  }

  /**
   * Obtiene el estado de la TUN
   */
  getStatus() {
    if (!this.tun) {
      return { running: false };
    }
    return {
      running: this.isRunning,
      name: this.options.name,
      ip: this.options.ip,
      netmask: this.options.netmask,
      peers: this.peers.size,
      peerList: Array.from(this.peers.entries()).map(([id, p]) => ({
        id,
        ip: p.ip,
      })),
    };
  }
}

// ============================================================
// EXPORT
// ============================================================

module.exports = ENE;