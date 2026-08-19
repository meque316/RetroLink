import CS16MatchInfo from "./CS16MatchInfo";
import Quake3MatchInfo from "./Quake3MatchInfo";
import UT99MatchInfo from "./UT99MatchInfo";
import AOMMatchInfo from "./AOMMatchInfo";

export default function MatchInfoPanel({
  gameId,
  gameOptions,
  isHost,
}) {
  if (!gameId || !gameOptions) {
    return null;
  }

  switch (gameId) {
    case "quake3":
      return (
        <Quake3MatchInfo
          gameOptions={gameOptions}
        />
      );

    case "cs16":
      return (
        <CS16MatchInfo
          gameOptions={gameOptions}
        />
      );

    case "ut99":
      return (
        <UT99MatchInfo
          gameOptions={gameOptions}
        />
      );
    case "aom":  
      return (
        <AOMMatchInfo
          gameOptions={gameOptions}
          isHost={isHost}
        />
      );  

    default:
      return null;
  }
}