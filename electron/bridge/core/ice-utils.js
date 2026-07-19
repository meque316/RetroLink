// electron/bridge/quake3/ice-utils.js

function getCandidateType(candidate) {
  if (typeof candidate !== "string") {
    return "unknown";
  }

  const match =
    candidate.match(/\styp\s+(\w+)/);

  return match
    ? match[1]
    : "unknown";
}

function describeCandidateTypes(types) {
  if (
    !types ||
    types.size === 0
  ) {
    return "ninguno";
  }

  return [...types].join(", ");
}

function hasUsableInternetCandidate(types) {
  return (
    types?.has("srflx") ||
    types?.has("relay")
  );
}

function hasRelayCandidate(types) {
  return Boolean(
    types?.has("relay")
  );
}

function flushCandidateQueue({
  peer,
  remoteDescSet,
  candidates,
  label,
}) {
  if (
    !peer ||
    !remoteDescSet ||
    !Array.isArray(candidates)
  ) {
    return candidates || [];
  }

  const stillPending = [];

  for (const {
    candidate,
    mid,
  } of candidates) {
    try {
      peer.addRemoteCandidate(
        candidate,
        mid
      );
    } catch (error) {
      console.warn(
        `[Bridge-Q3] No se pudo aplicar candidato ICE (${label}); se reintentará:`,
        error.message || error
      );

      stillPending.push({
        candidate,
        mid,
      });
    }
  }

  return stillPending;
}

function logGatheringResult(
  label,
  gatheredCandidateTypes
) {
  const description =
    describeCandidateTypes(
      gatheredCandidateTypes
    );

  console.log(
    `[Bridge-Q3] ${label}: gathering completo. Candidatos: ${description}.`
  );

  if (
    !hasUsableInternetCandidate(
      gatheredCandidateTypes
    )
  ) {
    console.warn(
      `[Bridge-Q3] ${label}: no se reunió ningún candidato srflx o relay.`
    );

    return;
  }

  if (
    !hasRelayCandidate(
      gatheredCandidateTypes
    )
  ) {
    console.warn(
      `[Bridge-Q3] ${label}: STUN funciona, pero no hay candidato TURN relay.`
    );
  }
}

module.exports = {
  getCandidateType,
  describeCandidateTypes,
  hasUsableInternetCandidate,
  hasRelayCandidate,
  flushCandidateQueue,
  logGatheringResult,
};