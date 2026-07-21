import {
  AlertTriangle,
  Check,
  Circle,
  LoaderCircle,
  Radio,
  Server,
  Wifi,
  X,
} from "lucide-react";

function StatusDot({
  status = "idle",
  label,
  value,
}) {
  const statusStyles = {
    ok: {
      icon: Check,
      iconClass: "text-green-400",
      containerClass:
        "border-green-500/20 bg-green-500/10",
      valueClass: "text-green-400",
    },

    loading: {
      icon: LoaderCircle,
      iconClass: "animate-spin text-yellow-400",
      containerClass:
        "border-yellow-500/20 bg-yellow-500/10",
      valueClass: "text-yellow-400",
    },

    error: {
      icon: X,
      iconClass: "text-red-400",
      containerClass:
        "border-red-500/20 bg-red-500/10",
      valueClass: "text-red-400",
    },

    idle: {
      icon: Circle,
      iconClass: "text-zinc-600",
      containerClass:
        "border-zinc-800 bg-zinc-900/50",
      valueClass: "text-zinc-400",
    },
  };

  const currentStyle =
    statusStyles[status] || statusStyles.idle;

  const Icon = currentStyle.icon;

  return (
    <div
      className={`flex min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-3 ${currentStyle.containerClass}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon
          size={15}
          className={`shrink-0 ${currentStyle.iconClass}`}
        />

        <span className="truncate text-xs font-medium text-zinc-400">
          {label}
        </span>
      </div>

      <span
        className={`shrink-0 text-right text-xs font-semibold ${currentStyle.valueClass}`}
      >
        {value}
      </span>
    </div>
  );
}

function getConnectionState(
  relayStatus,
  relayStep = ""
) {
  const message = relayStep.toLowerCase();

  const mentionsRelay =
    message.includes("relay");

  const relayActive =
    mentionsRelay &&
    (
      message.includes("conectado") ||
      message.includes("activo") ||
      message.includes("establecida") ||
      message.includes("listos para jugar")
    );

  const relayFailed =
    mentionsRelay &&
    (
      message.includes("error") ||
      message.includes("falló") ||
      message.includes("failed")
    );

  const webRTCFailed =
    (
      message.includes("webrtc") ||
      message.includes("p2p") ||
      message.includes("ice")
    ) &&
    (
      message.includes("error") ||
      message.includes("falló") ||
      message.includes("failed")
    );

  const connectionEstablished =
    relayStatus === "ok";

  const connectionFailed =
    relayStatus === "error";

  const connectionLoading =
    relayStatus === null;

  let bridgeStatus = "loading";
  let bridgeValue = "Starting";

  if (connectionEstablished) {
    bridgeStatus = "ok";
    bridgeValue = "Running";
  }

  if (connectionFailed) {
    bridgeStatus = "error";
    bridgeValue = "Error";
  }

  if (
    message.includes("bridge") &&
    (
      message.includes("error") ||
      message.includes("no se pudo")
    )
  ) {
    bridgeStatus = "error";
    bridgeValue = "Failed";
  }

  let transportStatus = "loading";
  let transportValue = "Connecting";

  if (connectionEstablished) {
    transportStatus = "ok";
    transportValue = relayActive
      ? "Relay"
      : "WebRTC";
  }

  if (connectionFailed) {
    transportStatus = "error";
    transportValue = "Unavailable";
  }

  let webRTCStatus = "loading";
  let webRTCValue = "Negotiating";

  if (connectionEstablished && !relayActive) {
    webRTCStatus = "ok";
    webRTCValue = "Connected";
  }

  if (webRTCFailed || relayActive) {
    webRTCStatus = "error";
    webRTCValue = "Failed";
  }

  if (
    connectionFailed &&
    !relayFailed
  ) {
    webRTCStatus = "error";
    webRTCValue = "Failed";
  }

  let relayConnectionStatus = "idle";
  let relayConnectionValue = "Standby";

  if (relayActive) {
    relayConnectionStatus = "ok";
    relayConnectionValue = "Active";
  } else if (relayFailed) {
    relayConnectionStatus = "error";
    relayConnectionValue = "Failed";
  } else if (
    webRTCFailed &&
    connectionLoading
  ) {
    relayConnectionStatus = "loading";
    relayConnectionValue = "Connecting";
  }

  return {
    bridgeStatus,
    bridgeValue,
    transportStatus,
    transportValue,
    webRTCStatus,
    webRTCValue,
    relayConnectionStatus,
    relayConnectionValue,
  };
}

function RelayStatus({
  relayStatus,
  relayStep,
}) {
  const connection =
    getConnectionState(
      relayStatus,
      relayStep
    );

  const isConnected =
    relayStatus === "ok";

  const hasError =
    relayStatus === "error";

  const isConnecting =
    relayStatus === null;

  const headerConfig = hasError
    ? {
        icon: AlertTriangle,
        title: "Connection failed",
        description:
          "RetroLink could not establish the connection.",
        containerClass:
          "border-red-500/20 bg-red-500/10",
        iconContainerClass:
          "bg-red-500/10 text-red-400",
        titleClass: "text-red-300",
      }
    : isConnected
      ? {
          icon: Wifi,
          title: "Connection established",
          description:
            "The multiplayer bridge is ready.",
          containerClass:
            "border-green-500/20 bg-green-500/10",
          iconContainerClass:
            "bg-green-500/10 text-green-400",
          titleClass: "text-green-300",
        }
      : {
          icon: Radio,
          title: "Establishing connection",
          description:
            "RetroLink is preparing the multiplayer session.",
          containerClass:
            "border-yellow-500/20 bg-yellow-500/10",
          iconContainerClass:
            "bg-yellow-500/10 text-yellow-400",
          titleClass: "text-yellow-300",
        };

  const HeaderIcon =
    headerConfig.icon;

  return (
    <div className="space-y-3">
      <div
        className={`rounded-xl border p-4 ${headerConfig.containerClass}`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${headerConfig.iconContainerClass}`}
          >
            <HeaderIcon
              size={17}
              className={
                isConnecting
                  ? "animate-pulse"
                  : ""
              }
            />
          </div>

          <div className="min-w-0">
            <h3
              className={`text-sm font-semibold ${headerConfig.titleClass}`}
            >
              {headerConfig.title}
            </h3>

            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              {headerConfig.description}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <StatusDot
          label="Bridge"
          status={
            connection.bridgeStatus
          }
          value={
            connection.bridgeValue
          }
        />

        <StatusDot
          label="Transport"
          status={
            connection.transportStatus
          }
          value={
            connection.transportValue
          }
        />

        <StatusDot
          label="WebRTC"
          status={
            connection.webRTCStatus
          }
          value={
            connection.webRTCValue
          }
        />

        <StatusDot
          label="Relay"
          status={
            connection.relayConnectionStatus
          }
          value={
            connection.relayConnectionValue
          }
        />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-[#0b1118] px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <Server
            size={14}
            className="text-zinc-500"
          />

          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Current stage
          </span>
        </div>

        <p
          className={`break-words text-xs leading-relaxed ${
            hasError
              ? "text-red-300"
              : isConnected
                ? "text-green-300"
                : "text-zinc-300"
          }`}
        >
          {relayStep ||
            "Iniciando conexión..."}
        </p>
      </div>
    </div>
  );
}

export default RelayStatus;