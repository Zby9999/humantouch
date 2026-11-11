import { Composition } from "remotion";
import { VariablesVideo } from "./VariablesVideo";

/** The small cards' videos, 16:9, cut to each card's shape on the site (object-fit: cover), the subject in the middle. */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="Variables" component={VariablesVideo} durationInFrames={7 * 30} fps={30} width={1600} height={900} />
    </>
  );
};
