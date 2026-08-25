// electron/eso-server.js
// Servidor ESO emulado para Age of Mythology
// CON EVENTOS DE DIAGNÓSTICO PARA CAPTURAR EL BODY SOAP

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

// ===== Configuración del servidor =====
const PORT = 3000;
const HOST = '127.0.0.1';

// ===== Archivo de cuentas =====
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');

// ===== Funciones auxiliares =====
function extractTag(body, tag) {
  const regex = new RegExp(`<${tag}>(.*?)</${tag}>`, 'i');
  const match = body.match(regex);
  return match ? match[1] : null;
}

function logRequest(req, pathname, body) {
  console.log(`[ESO] 📥 ${req.method} ${pathname}`);
  console.log(`[ESO] 📋 Headers:`, JSON.stringify(req.headers, null, 2));
  
  if (body && body.length > 0) {
    const truncated = body.length > 800 ? body.substring(0, 800) + '... (truncado)' : body;
    console.log(`[ESO] 📦 Body (${body.length} chars):`, truncated);
  } else {
    console.log('[ESO] 📦 Body: (vacío)');
  }
}

// ===== Gestión de cuentas =====
function loadAccounts() {
  try {
    return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
  } catch {
    return { users: {} };
  }
}

function saveAccounts(accounts) {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

function handleCreateAccount(body) {
  const username = extractTag(body, 'Username');
  const password = extractTag(body, 'Password');
  
  if (!username || !password) {
    return { success: false, error: 'Missing username or password' };
  }
  
  const accounts = loadAccounts();
  
  if (accounts.users[username]) {
    return { success: false, error: 'User already exists' };
  }
  
  accounts.users[username] = {
    password: password,
    country: extractTag(body, 'Country') || 'ES',
    nickname: username,
    created: new Date().toISOString()
  };
  
  saveAccounts(accounts);
  
  return { success: true, username };
}

function handleLogin(body) {
  const username = extractTag(body, 'Username');
  const password = extractTag(body, 'Password');
  
  if (!username || !password) {
    return { success: false, error: 'Missing username or password' };
  }
  
  const accounts = loadAccounts();
  
  if (!accounts.users[username]) {
    return { success: false, error: 'User not found' };
  }
  
  if (accounts.users[username].password !== password) {
    return { success: false, error: 'Invalid password' };
  }
  
  return { success: true, username };
}

// ===== Servicio: Configuración =====
function handleConfig(req, res) {
  console.log('[ESO] ✅ Config');
  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(`<?xml version="1.0" encoding="utf-8"?>
<ESOConfig>
  <AccountServiceUrl>http://127.0.0.1:3000/AomXServices/AccountService.asmx</AccountServiceUrl>
  <GunServiceUrl>http://127.0.0.1:3000/GunService/GunService.asmx</GunServiceUrl>
  <RankingServiceUrl>http://127.0.0.1:3000/RankingService/RankingService.asmx</RankingServiceUrl>
  <PatchURL>http://127.0.0.1:3000/</PatchURL>
  <GameListServiceUrl>http://127.0.0.1:3000/GameListService/GameListService.asmx</GameListServiceUrl>
  <ZoneAccessServiceUrl>http://127.0.0.1:3000/ZoneAccessService/ZoneAccessService.asmx</ZoneAccessServiceUrl>
</ESOConfig>
  `.trim());
}

// ===== Servicio: AccountService =====
function handleAccountService(body, req, res) {
  console.log('[ESO] ✅ AccountService');
  
  // CreateAccount
  if (body.includes('CreateAccount')) {
    console.log('[ESO] 📝 CreateAccount');
    const result = handleCreateAccount(body);
    
    if (result.success) {
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CreateAccountResponse xmlns="http://tempuri.org/">
      <CreateAccountResult>
        <Success>true</Success>
        <AccountID>${Date.now()}</AccountID>
        <Username>${result.username}</Username>
        <Message>Account created successfully</Message>
      </CreateAccountResult>
    </CreateAccountResponse>
  </soap:Body>
</soap:Envelope>
      `.trim());
    } else {
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CreateAccountResponse xmlns="http://tempuri.org/">
      <CreateAccountResult>
        <Success>false</Success>
        <Message>${result.error}</Message>
      </CreateAccountResult>
    </CreateAccountResponse>
  </soap:Body>
</soap:Envelope>
      `.trim());
    }
    return true;
  }
  
  // Login
  if (body.includes('Login')) {
    console.log('[ESO] 🔑 Login');
    const result = handleLogin(body);
    
    if (result.success) {
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <LoginResponse xmlns="http://tempuri.org/">
      <LoginResult>
        <Success>true</Success>
        <SessionID>${Date.now()}</SessionID>
        <Username>${result.username}</Username>
        <GUID>${Date.now()}</GUID>
      </LoginResult>
    </LoginResponse>
  </soap:Body>
</soap:Envelope>
      `.trim());
    } else {
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <LoginResponse xmlns="http://tempuri.org/">
      <LoginResult>
        <Success>false</Success>
        <Message>${result.error}</Message>
      </LoginResult>
    </LoginResponse>
  </soap:Body>
</soap:Envelope>
      `.trim());
    }
    return true;
  }
  
  // Authenticate (con ticket)
  if (body.includes('Authenticate')) {
    console.log('[ESO] 🔐 Authenticate');
    const username = extractTag(body, 'Username') || 'TestUser';
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <AuthenticateResponse xmlns="http://tempuri.org/">
      <AuthenticateResult>
        <Success>true</Success>
        <SessionID>${Date.now()}</SessionID>
        <AccountID>${Date.now()}</AccountID>
        <Username>${username}</Username>
      </AuthenticateResult>
    </AuthenticateResponse>
  </soap:Body>
</soap:Envelope>
    `.trim());
    return true;
  }
  
  // SetCountry
  if (body.includes('SetCountry')) {
    console.log('[ESO] 🌍 SetCountry');
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SetCountryResponse xmlns="http://tempuri.org/">
      <SetCountryResult>
        <Success>true</Success>
      </SetCountryResult>
    </SetCountryResponse>
  </soap:Body>
</soap:Envelope>
    `.trim());
    return true;
  }
  
  // GetCountry
  if (body.includes('GetCountry')) {
    console.log('[ESO] 🌍 GetCountry');
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetCountryResponse xmlns="http://tempuri.org/">
      <GetCountryResult>
        <Success>true</Success>
        <Country>ES</Country>
      </GetCountryResult>
    </GetCountryResponse>
  </soap:Body>
</soap:Envelope>
    `.trim());
    return true;
  }
  
  // GetSecretQuestion
  if (body.includes('GetSecretQuestion')) {
    console.log('[ESO] ❓ GetSecretQuestion');
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetSecretQuestionResponse xmlns="http://tempuri.org/">
      <GetSecretQuestionResult>
        <Success>true</Success>
        <Question>What is your pet's name?</Question>
      </GetSecretQuestionResult>
    </GetSecretQuestionResponse>
  </soap:Body>
</soap:Envelope>
    `.trim());
    return true;
  }
  
  // SetSecretQuestion
  if (body.includes('SetSecretQuestion')) {
    console.log('[ESO] ❓ SetSecretQuestion');
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SetSecretQuestionResponse xmlns="http://tempuri.org/">
      <SetSecretQuestionResult>
        <Success>true</Success>
      </SetSecretQuestionResult>
    </SetSecretQuestionResponse>
  </soap:Body>
</soap:Envelope>
    `.trim());
    return true;
  }
  
  // ValidateUser
  if (body.includes('ValidateUser')) {
    console.log('[ESO] ✅ ValidateUser');
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ValidateUserResponse xmlns="http://tempuri.org/">
      <ValidateUserResult>
        <Success>true</Success>
        <UserExists>true</UserExists>
      </ValidateUserResult>
    </ValidateUserResponse>
  </soap:Body>
</soap:Envelope>
    `.trim());
    return true;
  }
  
  // Otra operación
  console.log('[ESO] ⚠️ AccountService - Operación desconocida');
  return false;
}

// ===== Servicio: ZoneAccessService =====
function handleZoneAccess(body, req, res) {
  console.log('[ESO] ✅ ZoneAccessService');
  
  if (body.includes('GetMasterTicket')) {
    console.log('[ESO] 🎫 GetMasterTicket');
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetMasterTicketResponse xmlns="http://tempuri.org/">
      <GetMasterTicketResult>
        <Success>true</Success>
        <Ticket>
          <IV>abcdef1234567890</IV>
          <EncryptedText>dummy_encrypted_ticket_${Date.now()}</EncryptedText>
        </Ticket>
      </GetMasterTicketResult>
    </GetMasterTicketResponse>
  </soap:Body>
</soap:Envelope>
    `.trim());
    return true;
  }
  
  if (body.includes('GetServiceTicket')) {
    console.log('[ESO] 🎫 GetServiceTicket');
    const serviceId = extractTag(body, 'serviceID') || 'LegacyAuth';
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetServiceTicketResponse xmlns="http://tempuri.org/">
      <GetServiceTicketResult>
        <Success>true</Success>
        <Ticket>dummy_service_ticket_${serviceId}_${Date.now()}</Ticket>
      </GetServiceTicketResult>
    </GetServiceTicketResponse>
  </soap:Body>
</soap:Envelope>
    `.trim());
    return true;
  }
  
  if (body.includes('RegisterNickname')) {
    console.log('[ESO] 📝 RegisterNickname');
    const nickname = extractTag(body, 'Nickname') || 'RetroLinkUser';
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <RegisterNicknameResponse xmlns="http://tempuri.org/">
      <RegisterNicknameResult>
        <Success>true</Success>
        <Nickname>${nickname}</Nickname>
      </RegisterNicknameResult>
    </RegisterNicknameResponse>
  </soap:Body>
</soap:Envelope>
    `.trim());
    return true;
  }
  
  if (body.includes('ActivateProductKey')) {
    console.log('[ESO] 🔑 ActivateProductKey');
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ActivateProductKeyResponse xmlns="http://tempuri.org/">
      <ActivateProductKeyResult>
        <Success>true</Success>
      </ActivateProductKeyResult>
    </ActivateProductKeyResponse>
  </soap:Body>
</soap:Envelope>
    `.trim());
    return true;
  }
  
  if (body.includes('GetCDKeyTicket')) {
    console.log('[ESO] 🎫 GetCDKeyTicket');
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetCDKeyTicketResponse xmlns="http://tempuri.org/">
      <GetCDKeyTicketResult>
        <Success>true</Success>
        <Ticket>dummy_cdkey_ticket_${Date.now()}</Ticket>
      </GetCDKeyTicketResult>
    </GetCDKeyTicketResponse>
  </soap:Body>
</soap:Envelope>
    `.trim());
    return true;
  }
  
  if (body.includes('GetConfig')) {
    console.log('[ESO] ⚙️ GetConfig');
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetConfigResponse xmlns="http://tempuri.org/">
      <GetConfigResult>
        <Success>true</Success>
        <Config>dummy_config</Config>
      </GetConfigResult>
    </GetConfigResponse>
  </soap:Body>
</soap:Envelope>
    `.trim());
    return true;
  }
  
  console.log('[ESO] ⚠️ ZoneAccessService - Operación desconocida');
  return false;
}

// ===== Servicio: GameListService =====
function handleGameList(body, req, res) {
  console.log('[ESO] ✅ GameListService');
  
  // RetrieveGames - devolver lista de partidas
  if (body.includes('RetrieveGames')) {
    console.log('[ESO] 📋 RetrieveGames');
    
    // TODO: Aquí obtener las salas de RetroLink
    const gamesXml = `
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
    
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="utf-8"?>
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
    return true;
  }
  
  // InsertGame - crear nueva partida
  if (body.includes('InsertGame')) {
    console.log('[ESO] 📝 InsertGame');
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="utf-8"?>
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
    return true;
  }
  
  // DeleteGame - eliminar partida
  if (body.includes('DeleteGame')) {
    console.log('[ESO] 🗑️ DeleteGame');
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <DeleteGameResponse xmlns="http://ensemblestudios.com/GameListService/DeleteGame">
      <DeleteGameResult>
        <Success>true</Success>
      </DeleteGameResult>
    </DeleteGameResponse>
  </soap:Body>
</soap:Envelope>
    `.trim());
    return true;
  }
  
  console.log('[ESO] ⚠️ GameListService - Operación desconocida');
  return false;
}

// ===== INTERCEPTOR: Capturar TODAS las peticiones =====
const server = http.createServer((req, res) => {
  const chunks = [];
  let totalLength = 0;
  
  console.log('\n================ ESO REQUEST ================');
  console.log(`METHOD: ${req.method}`);
  console.log(`URL: ${req.url}`);
  console.log('HEADERS:');
  for (const [key, value] of Object.entries(req.headers)) {
    console.log(`  ${key}: ${value}`);
  }
  console.log('');
  
  // ===== EVENTOS DE DIAGNÓSTICO =====
  req.on("aborted", () => {
    console.log(`[ESO] ⚠️ REQUEST ABORTED - ${totalLength} bytes recibidos`);
  });

  req.on("error", (error) => {
    console.error(`[ESO] ❌ REQUEST ERROR:`, error);
  });

  req.on("close", () => {
    console.log(`[ESO] 🔌 REQUEST CLOSE - ${totalLength} bytes recibidos`);
  });
  // ===== FIN EVENTOS DE DIAGNÓSTICO =====
  
  // Capturar cada chunk del body
  req.on('data', (chunk) => {
    chunks.push(chunk);
    totalLength += chunk.length;
    console.log(`[CHUNK] ${chunk.length} bytes (total acumulado: ${totalLength})`);
  });
  
  req.on('end', () => {
    console.log(`[ESO] ✅ REQUEST END - ${totalLength} bytes recibidos`);
    
    // Unir todos los chunks
    const body = Buffer.concat(chunks).toString('utf8');
    
    console.log(`\nBODY COMPLETO (${totalLength} bytes):`);
    if (body.length > 0) {
      console.log(body);
    } else {
      console.log('(body vacío)');
    }
    console.log('============================================\n');
    
    // ===== Procesar la petición =====
    const parsedUrl = url.parse(req.url || '');
    let pathname = parsedUrl.pathname || '';
    
    // Normalizar URL: eliminar barra final
    if (pathname.endsWith('/') && pathname.length > 1) {
      pathname = pathname.slice(0, -1);
    }
    
    // También normalizar query strings
    const basePath = pathname.split('?')[0];

    // ===== Configuración =====
    if (basePath === '/ConfigSpain.aspx' || basePath === '/ConfigSpainXpack.aspx' || 
        basePath.includes('ConfigSpain')) {
      handleConfig(req, res);
      return;
    }

    // ===== AccountService =====
    if (basePath.includes('AccountService')) {
      console.log('[ESO] 🔍 AccountService detectado en:', basePath);
      if (handleAccountService(body, req, res)) return;
    }

    // ===== ZoneAccessService =====
    if (basePath.includes('ZoneAccessService')) {
      console.log('[ESO] 🔍 ZoneAccessService detectado en:', basePath);
      if (handleZoneAccess(body, req, res)) return;
    }

    // ===== GameListService =====
    if (basePath.includes('GameListService')) {
      console.log('[ESO] 🔍 GameListService detectado en:', basePath);
      if (handleGameList(body, req, res)) return;
    }

    // ===== Respuesta por defecto para cualquier otra cosa =====
    console.log('[ESO] ❓ DESCONOCIDO:', basePath);
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GenericResponse xmlns="http://tempuri.org/">
      <GenericResult>
        <Success>true</Success>
        <Message>OK</Message>
      </GenericResult>
    </GenericResponse>
  </soap:Body>
</soap:Envelope>
    `.trim());
  });
});

server.listen(PORT, HOST, () => {
  console.log('[ESO] 🎮 Servidor ESO completo con interceptor');
  console.log(`[ESO] 📡 http://${HOST}:${PORT}`);
  console.log('[ESO] 📋 Endpoints:');
  console.log('[ESO]   - GET  /ConfigSpain.aspx');
  console.log('[ESO]   - POST /AomXServices/AccountService.asmx');
  console.log('[ESO]   - POST /GameListService/GameListService.asmx');
  console.log('[ESO]   - POST /ZoneAccessService/ZoneAccessService.asmx');
  console.log('[ESO] 💡 Esperando peticiones de AoM...');
  console.log('[ESO] 🔍 INTERCEPTOR ACTIVADO: Todas las peticiones serán logueadas');
  console.log('[ESO] 📋 EVENTOS DE DIAGNÓSTICO ACTIVADOS: aborted, error, close, end');
});