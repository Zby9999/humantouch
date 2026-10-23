/** How the editor layer and the local service talk. Shared by both sides. */
import type { SavedChangeSet } from "./client/changeset";

/** Global the dev server sets on the page: where the local service is, and its token. */
export const SERVICE_GLOBAL = "__VERNIERKIT__";
/** Header that carries the token. A request without the right one is turned away. */
export const TOKEN_HEADER = "X-Vernier-Token";
/** Where the round is, on the local service. */
export const ROUND_PATH = "/round";

export interface ServiceConfig {
  /** `http://127.0.0.1:<port>` */
  url: string;
  token: string;
}

/**
 * The round being edited, as saved in `.vernier/`: the canvas and the
 * ChangeSet. `GET /round` answers with it (204: no round), `PUT /round` saves
 * it, `DELETE /round` drops it.
 */
export interface SavedRound {
  /** The edited canvas, as an HTML document. */
  canvas: string;
  changeSet: SavedChangeSet;
}
