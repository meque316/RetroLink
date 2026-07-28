// electron/main.js

const {
  app,
  BrowserWindow,
} = require("electron");

const path = require("path");

const registerIPCHandlers =
  require("./ipc/handlers");


const isDev =
  !app.isPackaged;


/*
 * Diagnóstico del proceso principal.
 * Estos listeners son temporales y sirven para descubrir
 * por qué Electron se cierra en el equipo cliente.
 */

process.on("exit", (code) => {
  console.log(
    "[MAIN-DIAG] Proceso principal finalizando. Código:",
    code
  );
});

process.on("beforeExit", (code) => {
  console.log(
    "[MAIN-DIAG] beforeExit. Código:",
    code
  );
});

process.on("uncaughtException", (error) => {
  console.error(
    "[MAIN-DIAG] uncaughtException:"
  );

  console.error(error);
});

process.on("unhandledRejection", (reason) => {
  console.error(
    "[MAIN-DIAG] unhandledRejection:"
  );

  console.error(reason);
});


app.on(
  "render-process-gone",
  (_event, webContents, details) => {
    console.error(
      "[MAIN-DIAG] render-process-gone:",
      {
        reason:
          details?.reason,

        exitCode:
          details?.exitCode,

        webContentsId:
          webContents?.id,
      }
    );
  }
);


app.on(
  "child-process-gone",
  (_event, details) => {
    console.error(
      "[MAIN-DIAG] child-process-gone:",
      details
    );
  }
);


app.on("before-quit", () => {
  console.log(
    "[MAIN-DIAG] Evento before-quit recibido."
  );
});


app.on("will-quit", () => {
  console.log(
    "[MAIN-DIAG] Evento will-quit recibido."
  );
});


app.on("quit", (_event, exitCode) => {
  console.log(
    "[MAIN-DIAG] Evento quit recibido. Código:",
    exitCode
  );
});


function createWindow() {
  const win =
    new BrowserWindow({
      width: 1400,
      height: 900,

      backgroundColor:
        "#0b0f14",

      webPreferences: {
        preload:
          path.join(
            __dirname,
            "preload.js"
          ),

        contextIsolation:
          true,

        nodeIntegration:
          false,
      },
    });


  console.log(
    "[MAIN-DIAG] BrowserWindow creada:",
    {
      id:
        win.id,

      webContentsId:
        win.webContents.id,
    }
  );


  win.on("close", (event) => {
    console.log(
      "[MAIN-DIAG] Evento close de BrowserWindow:",
      {
        id:
          win.id,

        defaultPrevented:
          event.defaultPrevented,
      }
    );
  });


  win.on("closed", () => {
    console.log(
      "[MAIN-DIAG] BrowserWindow cerrada:",
      win.id
    );
  });


  win.on("unresponsive", () => {
    console.error(
      "[MAIN-DIAG] BrowserWindow no responde:",
      win.id
    );
  });


  win.on("responsive", () => {
    console.log(
      "[MAIN-DIAG] BrowserWindow volvió a responder:",
      win.id
    );
  });


  win.webContents.on(
    "destroyed",
    () => {
      console.log(
        "[MAIN-DIAG] WebContents destruido:",
        win.webContents.id
      );
    }
  );


  win.webContents.on(
    "render-process-gone",
    (_event, details) => {
      console.error(
        "[MAIN-DIAG] Renderer de la ventana terminó:",
        {
          windowId:
            win.id,

          reason:
            details?.reason,

          exitCode:
            details?.exitCode,
        }
      );
    }
  );


  win.webContents.on(
    "did-fail-load",
    (
      _event,
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame
    ) => {
      console.error(
        "[MAIN-DIAG] did-fail-load:",
        {
          errorCode,
          errorDescription,
          validatedURL,
          isMainFrame,
        }
      );
    }
  );


  win.webContents.on(
    "console-message",
    (
      _event,
      level,
      message,
      line,
      sourceId
    ) => {
      console.log(
        "[RENDERER-CONSOLE]",
        {
          level,
          message,
          line,
          sourceId,
        }
      );
    }
  );


  if (isDev) {
    win.loadURL(
      "http://localhost:5173"
    );

    /*
     * DevTools separadas para poder ver errores de React
     * aunque la ventana principal desaparezca.
     */
    win.webContents.openDevTools({
      mode: "detach",
    });
  } else {
    win.loadFile(
      path.join(
        app.getAppPath(),
        "client",
        "dist",
        "index.html"
      )
    );
  }
}


app.whenReady().then(() => {
  console.log(
    "[MAIN-DIAG] Electron listo."
  );

  /*
   * Inicializa de forma transparente
   * los listeners desacoplados.
   */
  registerIPCHandlers();

  createWindow();


  app.on("activate", () => {
    console.log(
      "[MAIN-DIAG] Evento activate."
    );

    if (
      BrowserWindow
        .getAllWindows()
        .length === 0
    ) {
      createWindow();
    }
  });
});


app.on(
  "window-all-closed",
  () => {
    console.log(
      "[MAIN-DIAG] Todas las ventanas fueron cerradas."
    );

    if (
      process.platform !==
      "darwin"
    ) {
      console.log(
        "[MAIN-DIAG] Ejecutando app.quit() desde window-all-closed."
      );

      app.quit();
    }
  }
);