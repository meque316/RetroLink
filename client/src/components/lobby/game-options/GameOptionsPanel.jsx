import CS16Options from "./CS16Options";
import Quake3Options from "./Quake3Options";
import UT99Options from "./UT99Options";
import AOMOptions from "./AOMOptions";  // <-- Agregar

export default function GameOptionsPanel({
  gameId,
  gameOptions,
  setGameOptions,
}) {
  const updateGameOption = (key, value) => {
    setGameOptions((previousOptions) => ({
      ...previousOptions,
      [key]: value,
    }));
  };

  const sharedProps = {
    gameOptions,
    setGameOptions,
    updateGameOption,
  };

  switch (gameId) {
    case "quake3":
      return (
        <Quake3Options
          {...sharedProps}
        />
      );

    case "cs16":
      return (
        <CS16Options
          {...sharedProps}
        />
      );

    case "ut99":
      return (
        <UT99Options
          {...sharedProps}
        />
      );

    case "aom":  // <-- Agregar
      return (
        <AOMOptions
          {...sharedProps}
        />
      );

    default:
      return null;
  }
}