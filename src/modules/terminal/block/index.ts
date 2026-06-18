export { BlockDecorations } from "./lib/blockDecorations";
export { saveBlockMeta, loadBlockMeta } from "./lib/blockPersistence";
export {
  buildOsc133InjectionScript,
  waitForFirstOsc133,
} from "./lib/sshInjectionScript";
export { capAttachOutput } from "./lib/outputCap";
export { computeRange } from "./lib/blockRange";
export { readRangeText } from "./lib/readBlock";
export type {
  BlockMeta,
  BlockMode,
  PositionedBlock,
  VisibleBlocks,
  BlockChromeSettings,
  BlockMatch,
  BlockContext,
} from "./lib/types";
export { BlockChrome } from "./BlockChrome";
export { StickyHeader } from "./StickyHeader";
export { BlockSearchBar } from "./BlockSearchBar";
export { BlockOverlay } from "./BlockOverlay";
export { ShellInput } from "./ShellInput";
export { BlockWatermark } from "./BlockWatermark";
