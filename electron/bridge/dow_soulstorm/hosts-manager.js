// electron/bridge/dow_soulstorm/hosts-manager.js

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOSTS_PATH = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
const BACKUP_PATH = path.join(__dirname, 'hosts.backup');

// Dominios de GameSpy que Soulstorm usa
const DOMAINS = [
  'master.gamespy.com',
  'gslaunch.gamespy.com',
  'gamespy.com',
  'gs.gamespy.com',
  'fileplanet.gamespy.com',
];

const ENTRIES = DOMAINS.map(domain => `127.0.0.1 ${domain}`);

function isWindows() {
  return os.platform() === 'win32';
}

function isElevated() {
  try {
    const testPath = path.join(__dirname, 'test_write.tmp');
    fs.writeFileSync(testPath, 'test');
    fs.unlinkSync(testPath);
    return true;
  } catch (e) {
    return false;
  }
}

function backupHosts() {
  if (!isWindows()) {
    console.log('[HostsManager] ⚠️ No es Windows, omitiendo backup');
    return false;
  }

  try {
    if (fs.existsSync(HOSTS_PATH)) {
      fs.copyFileSync(HOSTS_PATH, BACKUP_PATH);
      console.log('[HostsManager] ✅ Backup del hosts file creado');
      return true;
    }
    console.log('[HostsManager] ⚠️ hosts file no encontrado');
    return false;
  } catch (error) {
    console.error('[HostsManager] ❌ Error creando backup:', error.message);
    return false;
  }
}

function enableGameSpyRedirect() {
  if (!isWindows()) {
    console.log('[HostsManager] ⚠️ No es Windows, omitiendo redirección');
    return false;
  }

  if (!isElevated()) {
    console.warn('[HostsManager] ⚠️ Permisos insuficientes. Ejecutar como administrador.');
    return false;
  }

  try {
    let content = fs.readFileSync(HOSTS_PATH, 'utf8');
    let modified = false;

    for (const entry of ENTRIES) {
      if (!content.includes(entry)) {
        content += `\n${entry}`;
        modified = true;
        console.log(`[HostsManager] ✅ Agregado: ${entry}`);
      } else {
        console.log(`[HostsManager] ⏭️ Ya existe: ${entry}`);
      }
    }

    if (modified) {
      fs.writeFileSync(HOSTS_PATH, content);
      console.log('[HostsManager] ✅ hosts file actualizado');
      return true;
    }

    console.log('[HostsManager] ⏭️ hosts file ya está configurado');
    return true;
  } catch (error) {
    console.error('[HostsManager] ❌ Error modificando hosts file:', error.message);
    return false;
  }
}

function disableGameSpyRedirect() {
  if (!isWindows()) {
    console.log('[HostsManager] ⚠️ No es Windows, omitiendo restauración');
    return false;
  }

  if (!isElevated()) {
    console.warn('[HostsManager] ⚠️ Permisos insuficientes para restaurar');
    return false;
  }

  try {
    if (fs.existsSync(BACKUP_PATH)) {
      fs.copyFileSync(BACKUP_PATH, HOSTS_PATH);
      fs.unlinkSync(BACKUP_PATH);
      console.log('[HostsManager] ✅ hosts file restaurado');
      return true;
    }

    console.log('[HostsManager] ⚠️ No hay backup para restaurar');
    return false;
  } catch (error) {
    console.error('[HostsManager] ❌ Error restaurando hosts file:', error.message);
    return false;
  }
}

function getCurrentEntries() {
  if (!isWindows()) {
    return [];
  }

  try {
    const content = fs.readFileSync(HOSTS_PATH, 'utf8');
    const lines = content.split('\n');
    const current = [];
    for (const line of lines) {
      for (const domain of DOMAINS) {
        if (line.includes(domain)) {
          current.push(line.trim());
        }
      }
    }
    return current;
  } catch (error) {
    console.error('[HostsManager] ❌ Error leyendo hosts file:', error.message);
    return [];
  }
}

module.exports = {
  enableGameSpyRedirect,
  disableGameSpyRedirect,
  backupHosts,
  getCurrentEntries,
  isElevated,
  DOMAINS,
  ENTRIES,
};