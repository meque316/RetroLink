import { useEffect, useState } from "react";

export default function useRoomRelay({ room, isHost }) {
  const [relayStatus, setRelayStatus] = useState(null);
  const [relayStep, setRelayStep] = useState("");

  const [hostIP, setHostIP] = useState(null);
  const [hostIPReceived, setHostIPReceived] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const startRelay = async () => {
      if (!isMounted) return;

      setRelayStatus(null);
      setRelayStep("Iniciando conexión...");

      try {
        const result = await window.retroLink?.startRelay(
          room.id,
          isHost,
          room.game
        );

        if (!isMounted) return;

        if (!result?.success) {
          setRelayStatus("error");
          setRelayStep(
            "No se pudo iniciar el bridge: " +
              (result?.error || "Error desconocido")
          );

          return;
        }

        setRelayStep(
          isHost
            ? "Esperando jugadores..."
            : "Conectando al host..."
        );
      } catch (error) {
        if (!isMounted) return;

        setRelayStatus("error");
        setRelayStep(
          "Error al iniciar el bridge: " +
            (error?.message || String(error))
        );
      }
    };

    const handleBridgeStatus = (message) => {
      if (!isMounted) return;

      const statusMessage =
        typeof message === "string"
          ? message
          : message?.message || String(message ?? "");

      setRelayStep(statusMessage);

      const lowerMsg = statusMessage.toLowerCase();

      /*
       * Mensajes que confirman que el transporte está listo.
       *
       * El host recibe:
       * "Relay activado con el cliente."
       *
       * El cliente normalmente recibe:
       * "Conexión establecida mediante Relay."
       *
       * También se conservan los mensajes utilizados por P2P.
       */
      const connectionReady =
        lowerMsg.includes("conexión establecida") ||
        lowerMsg.includes("conexion establecida") ||
        lowerMsg.includes("conexión p2p establecida") ||
        lowerMsg.includes("conexion p2p establecida") ||
        lowerMsg.includes("listos para jugar") ||
        lowerMsg.includes("relay activado") ||
        lowerMsg.includes("relay listo") ||
        lowerMsg.includes("conectado mediante relay");

      if (connectionReady) {
        setRelayStatus("ok");
        return;
      }

      /*
       * Solo consideramos error los mensajes que representan
       * un fallo final. Un timeout de P2P no debe marcar error,
       * porque en ese momento RetroLink intenta cambiar a Relay.
       */
      const connectionError =
        lowerMsg.includes("no se pudo conectar") ||
        lowerMsg.includes("falló webrtc y relay") ||
        lowerMsg.includes("fallo webrtc y relay") ||
        lowerMsg.includes("error relay") ||
        lowerMsg.includes("puerto ocupado") ||
        lowerMsg.includes("bridge ocupado");

      if (connectionError) {
        setRelayStatus("error");
        return;
      }

      /*
       * Estados intermedios. Mantienen bloqueado el inicio de
       * la partida hasta que llegue una confirmación real.
       */
      const connectionPending =
        lowerMsg.includes("esperando jugadores") ||
        lowerMsg.includes("conectando") ||
        lowerMsg.includes("creando conexión") ||
        lowerMsg.includes("creando conexion") ||
        lowerMsg.includes("intentando relay") ||
        lowerMsg.includes("usando relay") ||
        lowerMsg.includes("p2p agotó el tiempo") ||
        lowerMsg.includes("p2p agoto el tiempo");

      if (connectionPending) {
        setRelayStatus(null);
      }
    };

    const handleBridgeReady = () => {
      if (!isMounted) return;

      setRelayStatus("ok");
      setRelayStep(
        "¡Conexión P2P establecida! Listos para jugar."
      );
    };

    const handleHostIP = (data) => {
      if (!isMounted) return;

      setHostIP(data?.hostIP ?? null);
      setHostIPReceived(Boolean(data?.hostIP));
    };

    const handleGameDetected = (game) => {
      if (!isMounted) return;

      const gameName = game?.name || "Juego";
      const gamePort = game?.defaultPort;

      setRelayStep(
        gamePort
          ? `Juego: ${gameName} (puerto: ${gamePort})`
          : `Juego: ${gameName}`
      );
    };

    window.retroLink?.onBridgeStatus?.(
      handleBridgeStatus
    );
    window.retroLink?.onBridgeReady?.(
      handleBridgeReady
    );
    window.retroLink?.onHostIPReceived?.(
      handleHostIP
    );
    window.retroLink?.onGameDetected?.(
      handleGameDetected
    );

    startRelay();

    return () => {
      isMounted = false;

      window.retroLink?.stopRelay();
      window.retroLink?.offBridgeStatus?.();
      window.retroLink?.offBridgeReady?.();
      window.retroLink?.offHostIPReceived?.();
      window.retroLink?.offGameDetected?.();
    };
  }, [room.id, room.game, isHost]);

  return {
    relayStatus,
    relayStep,
    hostIP,
    hostIPReceived,
  };
}