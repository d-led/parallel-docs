import type { SideTrackStaticBrowsePathResolver } from "./browse-contract.js";
import { staticBrowseIndexRelPathFromPair } from "./sidetrack-static-browse-path.js";

/** Default resolver: mirror `{storageDir}/source/…` under `browse/…/index.html`. */
export const defaultSideTrackStaticBrowsePathResolver: SideTrackStaticBrowsePathResolver = {
  browseIndexRelPathFromPair: staticBrowseIndexRelPathFromPair,
};
