import { Composition } from "remotion";
import { BriefVideo } from "./BriefVideo";
import { VariablesVideo } from "./VariablesVideo";

/** The small cards' videos, 16:9, cut to each card's shape on the site (object-fit: cover), the subject in the middle. */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="Brief" component={BriefVideo} durationInFrames={7 * 30} fps={30} width={1600} height={900} />
      <Composition id="Variables" component={VariablesVideo} durationInFrames={7 * 30} fps={30} width={1600} height={900} />
    </>
  );
};
