# RetroLink

<p align="center">
  <img src="docs/logo.png" width="220" alt="RetroLink Logo">
</p>

<p align="center">
  <strong>Reviviendo los clásicos, juntos.</strong>
</p>

<p align="center">

![Version](https://img.shields.io/badge/version-v0.1.0-blue)
![Status](https://img.shields.io/badge/status-Beta-orange)
![Platform](https://img.shields.io/badge/platform-Windows-success)
![Electron](https://img.shields.io/badge/Electron-42-47848F)
![React](https://img.shields.io/badge/React-19-61DAFB)
![License](https://img.shields.io/badge/license-MIT-green)

</p>

---

# ¿Qué es RetroLink?

RetroLink es una plataforma diseñada para facilitar partidas multijugador en juegos clásicos de PC utilizando conexiones **P2P** y **Relay** de forma completamente transparente para el usuario.

Su objetivo es eliminar configuraciones complicadas, redes VPN y modificaciones innecesarias, permitiendo que volver a jugar títulos clásicos online sea tan simple como crear una sala e invitar a un amigo.

---

# Características

- 🎮 Biblioteca de juegos
- 👤 Sistema de cuentas
- 🖼️ Perfil con avatar
- 💬 Chat integrado
- 🌐 Conexión P2P automática
- 🔄 Relay automático cuando P2P no es posible
- 🚀 Lanzamiento automático del juego
- 📚 Configuración individual por juego
- ⚙️ Arquitectura modular para agregar nuevos juegos
- 🛡️ Motor reutilizable para futuros bridges

---

# Juegos compatibles

| Juego | Estado |
|--------|--------|
| ✅ Quake III Arena | Compatible |
| ✅ Counter-Strike 1.6 | Compatible |
| ✅ Unreal Tournament '99 | Compatible |
| 🟡 Carmageddon II: Carpocalypse Now | Experimental |

---

# Próximamente

Los siguientes títulos ya se encuentran en planificación para futuras versiones:

- Dawn of War
- Age of Mythology
- Star Wars Galactic Battlegrounds

---

# Capturas

*(Se agregarán capturas de pantalla en próximas versiones.)*

```
Lobby
Biblioteca
Sala
Sistema Relay
```

---

# Instalación

1. Descarga la última versión desde la sección **Releases**.
2. Ejecuta el instalador.
3. Inicia sesión.
4. Configura la ruta de cada juego.
5. Crea una sala.
6. ¡A jugar!

---

# Requisitos

- Windows 10 u 11
- Conexión a Internet
- Copia legal del juego
- La misma versión del juego entre todos los jugadores

---

# Arquitectura

```text
                  RetroLink

           ┌──────────────────┐
           │   React + Vite   │
           └────────┬─────────┘
                    │
           Socket.IO / Electron
                    │
      ┌─────────────┴─────────────┐
      │                           │
     P2P                       Relay
      │                           │
      └─────────────┬─────────────┘
                    │
          Bridge específico
             para cada juego
                    │
                 Juego
```

Cada juego utiliza un **bridge independiente**, construido sobre un motor reutilizable que permite agregar nuevos títulos sin reescribir toda la infraestructura de red.

---

# Estado del proyecto

RetroLink se encuentra actualmente en fase **Beta**.

Las funciones principales ya se encuentran operativas y el proyecto continúa expandiendo su catálogo de juegos compatibles.

---

# Roadmap

## Completado

- [x] Sistema de cuentas
- [x] Biblioteca
- [x] Chat
- [x] Salas
- [x] Conexión P2P
- [x] Relay automático
- [x] Quake III Arena
- [x] Counter-Strike 1.6
- [x] Unreal Tournament '99'

## En desarrollo

- [ ] Carmageddon II
- [ ] Overlay
- [ ] Lista de amigos
- [ ] Invitaciones
- [ ] Actualizador automático

## Futuro

- [ ] RTS clásicos
- [ ] Más juegos LAN
- [ ] Estadísticas
- [ ] Perfil público
- [ ] API para nuevos bridges

---

# Contribuciones

Las contribuciones son bienvenidas.

Puedes colaborar mediante:

- Reportes de errores
- Sugerencias
- Pull Requests
- Nuevos bridges para juegos compatibles

---

# Reportar un error

Si encuentras un problema, intenta incluir la siguiente información:

- Juego utilizado
- Rol (Host o Cliente)
- Tipo de conexión (P2P o Relay)
- Versión de RetroLink
- Capturas de pantalla
- Logs de RetroLink

Esto facilita enormemente la reproducción y solución del problema.

---

# Comunidad

Únete a nuestro servidor de Discord:

**https://discord.gg/rSERkhBgU2**

Allí puedes:

- Reportar errores
- Compartir sugerencias
- Buscar jugadores
- Seguir el desarrollo del proyecto

---

# Licencia

RetroLink distribuye únicamente su propio software.

Los juegos compatibles pertenecen a sus respectivos propietarios y deben adquirirse legalmente.

---

# Agradecimientos

Gracias a todas las personas que han participado en las pruebas de RetroLink.

Cada reporte de errores, sugerencia y prueba de conexión ha ayudado a mejorar el proyecto.

---

<p align="center">

## Reviviendo los clásicos, juntos.

</p>
