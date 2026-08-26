// electron/bridge/core/matchmaking/emulators/ESOEmulator.js

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');

/**
 * Emulador de ESO (Ensemble Studios Online) para Age of Mythology
 * 
 * Este emulador permite que AoM se conecte a un servidor local
 * en lugar del servidor original de ESO (que ya no existe).
 * 
 * Funciona redirigiendo las peticiones HTTP/SOAP de AoM a un
 * servidor local que emula las APIs de ESO.
 */
class ESOEmulator {
  constructor(options = {}) {
    this.port = options.port || 3000;
    this.matchmaking = options.matchmaking || null;
    this.server = null;
    this.running = false;
    this.accounts = this._loadAccounts();
  }

  /**
   * Iniciar el servidor
   */
  start() {
    if (this.running) {
      console.log('[ESO] ℹ️ Emulador ya está corriendo');
      return;
    }

    this.server = http.createServer((req, res) => this._handleRequest(req, res));
    this.server.listen(this.port, () => {
      this.running = true;
      console.log(`[ESO] 🎮 Emulador ESO en http://127.0.0.1:${this.port}`);
    });
  }

  /**
   * Detener el servidor
   */
  stop() {
    if (!this.running) return;
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.running = false;
    console.log('[ESO] 🛑 Emulador ESO detenido');
  }

  /**
   * Verificar si está corriendo
   */
  isRunning() {
    return this.running;
  }

  // ============================================================
  // MANEJO DE PETICIONES
  // ============================================================

  _handleRequest(req, res) {
    const parsedUrl = url.parse(req.url || '');
    let pathname = parsedUrl.pathname || '';

    if (pathname.endsWith('/') && pathname.length > 1) {
      pathname = pathname.slice(0, -1);
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      console.log(`[ESO] 📥 ${req.method} ${pathname}`);

      // Configuración
      if (pathname === '/ConfigSpain.aspx' || pathname === '/ConfigSpainXpack.aspx') {
        this._handleConfig(req, res);
        return;
      }

      // AccountService
      if (pathname === '/AomXServices/AccountService.asmx') {
        this._handleAccountService(body, req, res);
        return;
      }

      // GameListService
      if (pathname === '/GameListService/GameListService.asmx') {
        this._handleGameListService(body, req, res);
        return;
      }

      // ZoneAccessService
      if (pathname === '/ZoneAccessService/ZoneAccessService.asmx') {
        this._handleZoneAccessService(body, req, res);
        return;
      }

      // Respuesta por defecto
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end('<Success>true</Success>');
    });
  }

  // ============================================================
  // CONFIGURACIÓN
  // ============================================================

  _handleConfig(req, res) {
    console.log('[ESO] ✅ Config');
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`
<?xml version="1.0" encoding="utf-8"?>
<ESOConfig>
  <AccountServiceUrl>http://127.0.0.1:${this.port}/AomXServices/AccountService.asmx</AccountServiceUrl>
  <GunServiceUrl>http://127.0.0.1:${this.port}/GunService/GunService.asmx</GunServiceUrl>
  <RankingServiceUrl>http://127.0.0.1:${this.port}/RankingService/RankingService.asmx</RankingServiceUrl>
  <PatchURL>http://127.0.0.1:${this.port}/</PatchURL>
  <GameListServiceUrl>http://127.0.0.1:${this.port}/GameListService/GameListService.asmx</GameListServiceUrl>
  <ZoneAccessServiceUrl>http://127.0.0.1:${this.port}/ZoneAccessService/ZoneAccessService.asmx</ZoneAccessServiceUrl>
</ESOConfig>
    `.trim());
  }

  // ============================================================
  // ACCOUNT SERVICE
  // ============================================================

  _handleAccountService(body, req, res) {
    console.log('[ESO] ✅ AccountService');

    if (body.includes('CreateAccount')) {
      this._handleCreateAccount(body, req, res);
      return;
    }

    if (body.includes('Login')) {
      this._handleLogin(body, req, res);
      return;
    }

    if (body.includes('Authenticate')) {
      this._handleAuthenticate(body, req, res);
      return;
    }

    // Respuesta genérica
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(this._createSoapResponse('Generic', { Success: true }));
  }

  _handleCreateAccount(body, req, res) {
    console.log('[ESO] 📝 CreateAccount');
    const username = this._extractTag(body, 'Username') || 'TestUser';
    const password = this._extractTag(body, 'Password') || 'password';

    if (this.accounts[username]) {
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(this._createSoapResponse('CreateAccount', {
        Success: false,
        Message: 'User already exists'
      }));
      return;
    }

    this.accounts[username] = {
      password: password,
      country: this._extractTag(body, 'Country') || 'ES',
      nickname: username,
      created: new Date().toISOString()
    };
    this._saveAccounts();

    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(this._createSoapResponse('CreateAccount', {
      Success: true,
      AccountID: Date.now(),
      Username: username,
      Message: 'Account created successfully'
    }));
  }

  _handleLogin(body, req, res) {
    console.log('[ESO] 🔑 Login');
    const username = this._extractTag(body, 'Username') || 'TestUser';
    const password = this._extractTag(body, 'Password') || 'password';

    if (!this.accounts[username] || this.accounts[username].password !== password) {
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(this._createSoapResponse('Login', {
        Success: false,
        Message: 'Invalid credentials'
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(this._createSoapResponse('Login', {
      Success: true,
      SessionID: Date.now(),
      Username: username,
      GUID: Date.now()
    }));
  }

  _handleAuthenticate(body, req, res) {
    console.log('[ESO] 🔐 Authenticate');
    const username = this._extractTag(body, 'Username') || 'TestUser';
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(this._createSoapResponse('Authenticate', {
      Success: true,
      SessionID: Date.now(),
      AccountID: Date.now(),
      Username: username
    }));
  }

  // ============================================================
  // GAME LIST SERVICE
  // ============================================================

  _handleGameListService(body, req, res) {
    console.log('[ESO] ✅ GameListService');

    if (body.includes('RetrieveGames')) {
      this._handleRetrieveGames(body, req, res);
      return;
    }

    if (body.includes('InsertGame')) {
      this._handleInsertGame(body, req, res);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(this._createSoapResponse('Generic', { Success: true }));
  }

  _handleRetrieveGames(body, req, res) {
    console.log('[ESO] 📋 RetrieveGames');

    // Obtener salas de EME
    let rooms = [];
    if (this.matchmaking) {
      rooms = this.matchmaking.getRooms('aom');
    }

    let gamesXml = '';
    if (rooms.length === 0) {
      gamesXml = `
    <Game>
      <KeyValuePair>
        <Key>GameName</Key>
        <Value>RetroLink Test Game</Value>
      </KeyValuePair>
      <KeyValuePair>
        <Key>Host</Key>
        <Value>RetroLink</Value>
      </KeyValuePair>
      <KeyValuePair>
        <Key>Players</Key>
        <Value>1</Value>
      </KeyValuePair>
      <KeyValuePair>
        <Key>MaxPlayers</Key>
        <Value>8</Value>
      </KeyValuePair>
      <KeyValuePair>
        <Key>Map</Key>
        <Value>Random</Value>
      </KeyValuePair>
    </Game>`;
    } else {
      gamesXml = rooms.map(room => `
    <Game>
      <KeyValuePair>
        <Key>GameName</Key>
        <Value>${room.name}</Value>
      </KeyValuePair>
      <KeyValuePair>
        <Key>Host</Key>
        <Value>${room.hostId}</Value>
      </KeyValuePair>
      <KeyValuePair>
        <Key>Players</Key>
        <Value>${room.players ? room.players.length : 0}</Value>
      </KeyValuePair>
      <KeyValuePair>
        <Key>MaxPlayers</Key>
        <Value>${room.maxPlayers || 8}</Value>
      </KeyValuePair>
    </Game>`).join('');
    }

    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <RetrieveGamesResponse xmlns="http://ensemblestudios.com/GameListService/RetrieveGames">
      <RetrieveGamesResult>
        <Games>${gamesXml}</Games>
      </RetrieveGamesResult>
    </RetrieveGamesResponse>
  </soap:Body>
</soap:Envelope>
    `.trim());
  }

  _handleInsertGame(body, req, res) {
    console.log('[ESO] 📝 InsertGame');
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <InsertGameResponse xmlns="http://ensemblestudios.com/GameListService/InsertGame">
      <InsertGameResult>
        <Success>true</Success>
        <GameID>${Date.now()}</GameID>
      </InsertGameResult>
    </InsertGameResponse>
  </soap:Body>
</soap:Envelope>
    `.trim());
  }

  // ============================================================
  // ZONE ACCESS SERVICE
  // ============================================================

  _handleZoneAccessService(body, req, res) {
    console.log('[ESO] ✅ ZoneAccessService');

    if (body.includes('GetMasterTicket')) {
      console.log('[ESO] 🎫 GetMasterTicket');
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(`
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetMasterTicketResponse xmlns="http://tempuri.org/">
      <GetMasterTicketResult>
        <Success>true</Success>
        <Ticket>
          <IV>abcdef1234567890</IV>
          <EncryptedText>dummy_ticket_${Date.now()}</EncryptedText>
        </Ticket>
      </GetMasterTicketResult>
    </GetMasterTicketResponse>
  </soap:Body>
</soap:Envelope>
      `.trim());
      return;
    }

    if (body.includes('GetServiceTicket')) {
      console.log('[ESO] 🎫 GetServiceTicket');
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(`
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetServiceTicketResponse xmlns="http://tempuri.org/">
      <GetServiceTicketResult>
        <Success>true</Success>
        <Ticket>dummy_service_ticket_${Date.now()}</Ticket>
      </GetServiceTicketResult>
    </GetServiceTicketResponse>
  </soap:Body>
</soap:Envelope>
      `.trim());
      return;
    }

    if (body.includes('RegisterNickname')) {
      console.log('[ESO] 📝 RegisterNickname');
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(`
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <RegisterNicknameResponse xmlns="http://tempuri.org/">
      <RegisterNicknameResult>
        <Success>true</Success>
        <Nickname>RetroLinkUser</Nickname>
      </RegisterNicknameResult>
    </RegisterNicknameResponse>
  </soap:Body>
</soap:Envelope>
      `.trim());
      return;
    }

    // Respuesta genérica para ZoneAccess
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(this._createSoapResponse('Generic', { Success: true }));
  }

  // ============================================================
  // FUNCIONES AUXILIARES
  // ============================================================

  _loadAccounts() {
    try {
      return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
    } catch {
      return { users: {} };
    }
  }

  _saveAccounts() {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(this.accounts, null, 2));
  }

  _extractTag(body, tag) {
    const regex = new RegExp(`<${tag}>(.*?)</${tag}>`, 'i');
    const match = body.match(regex);
    return match ? match[1] : null;
  }

  _createSoapResponse(operation, data) {
    const fields = Object.entries(data).map(([key, value]) => 
      `<${key}>${value}</${key}>`
    ).join('');

    return `
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${operation}Response xmlns="http://tempuri.org/">
      <${operation}Result>
        ${fields}
      </${operation}Result>
    </${operation}Response>
  </soap:Body>
</soap:Envelope>
    `.trim();
  }
}

module.exports = ESOEmulator;