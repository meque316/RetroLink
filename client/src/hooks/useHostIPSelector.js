import {
  useEffect,
  useState,
} from "react";

function selectPreferredIP(ips = []) {
  if (!Array.isArray(ips) || ips.length === 0) {
    return null;
  }

  return (
    ips.find((ip) =>
      ip?.address?.startsWith("26.")
    ) ||
    ips.find((ip) =>
      ip?.address?.startsWith("10.")
    ) ||
    ips.find((ip) =>
      ip?.address?.startsWith("192.168.")
    ) ||
    ips[0]
  );
}

function useHostIPSelector(isHost) {
  const [availableIPs, setAvailableIPs] =
    useState([]);

  const [selectedIP, setSelectedIP] =
    useState(null);

  const [
    showIPSelector,
    setShowIPSelector,
  ] = useState(false);

  const [
    isLoadingIPs,
    setIsLoadingIPs,
  ] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadIPs = async () => {
      if (!isHost) {
        return;
      }

      setIsLoadingIPs(true);

      try {
        const ips =
          await window.retroLink?.getLocalIPs();

        if (
          cancelled ||
          !Array.isArray(ips) ||
          ips.length === 0
        ) {
          return;
        }

        setAvailableIPs(ips);

        const preferred =
          selectPreferredIP(ips);

        if (!preferred?.address) {
          return;
        }

        setSelectedIP(preferred.address);

        await window.retroLink?.setHostIP(
          preferred.address
        );
      } catch (error) {
        console.error(
          "[useHostIPSelector] Error loading IPs:",
          error
        );
      } finally {
        if (!cancelled) {
          setIsLoadingIPs(false);
        }
      }
    };

    loadIPs();

    return () => {
      cancelled = true;
    };
  }, [isHost]);

  const handleIPSelect = async (ip) => {
    if (!ip) {
      return;
    }

    setSelectedIP(ip);
    setShowIPSelector(false);

    try {
      await window.retroLink?.setHostIP(ip);
    } catch (error) {
      console.error(
        "[useHostIPSelector] Error setting host IP:",
        error
      );
    }
  };

  return {
    availableIPs,
    selectedIP,
    showIPSelector,
    setShowIPSelector,
    isLoadingIPs,
    handleIPSelect,
  };
}

export default useHostIPSelector;