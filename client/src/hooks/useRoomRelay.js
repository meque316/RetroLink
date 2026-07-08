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
        } else {
          setRelayStep(
            isHost ? "Esperando jugadores..." : "Conectando al host..."
          );
        }
      } catch (error) {
        if (!isMounted) return;

        setRelayStatus("error");
        setRelayStep("Error al iniciar el bridge: " + error.message);
      }
    };

    startRelay();

    const handleBridgeStatus = (message) => {
      if (!isMounted) return;

      setRelayStep(message);

      const lowerMsg = message.toLowerCase();

      if (
        lowerMsg.includes("conexión establecida") ||
        lowerMsg.includes("listos para jugar") ||
        lowerMsg.includes("conectado") ||
        lowerMsg.includes("conexión p2p establecida")
      ) {
        setRelayStatus("ok");
      } else if (
        lowerMsg.includes("error") ||
        lowerMsg.includes("falló") ||
        lowerMsg.includes("ocupado")
      ) {
        setRelayStatus("error");
      } else if (lowerMsg.includes("esperando jugadores")) {
        setRelayStatus(null);
      }
    };

    const handleBridgeReady = () => {
      if (!isMounted) return;

      setRelayStatus("ok");
      setRelayStep("¡Conexión P2P establecida! Listos para jugar.");
    };

    const handleHostIP = (data) => {
      if (!isMounted) return;

      setHostIP(data.hostIP);
      setHostIPReceived(true);
    };

    const handleGameDetected = (game) => {
      if (!isMounted) return;

      setRelayStep(`Juego: ${game.name} (puerto: ${game.defaultPort})`);
    };

    window.retroLink?.onBridgeStatus?.(handleBridgeStatus);
    window.retroLink?.onBridgeReady?.(handleBridgeReady);
    window.retroLink?.onHostIPReceived?.(handleHostIP);
    window.retroLink?.onGameDetected?.(handleGameDetected);

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