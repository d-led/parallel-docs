import type { ParallelDocsStaticBrowsePathResolver } from "./browse-contract.js";
import { staticBrowseIndexRelPathFromPair } from "./parallel-docs-static-browse-path.js";

/** Default resolver: mirror `{storageDir}/source/…` under `browse/…/index.html`. */
export const defaultParallelDocsStaticBrowsePathResolver: ParallelDocsStaticBrowsePathResolver = {
  browseIndexRelPathFromPair: staticBrowseIndexRelPathFromPair,
};
