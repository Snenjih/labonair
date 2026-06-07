export { BlockDecorations } from "./lib/blockDecorations";
export { ModeMachine } from "./lib/modeMachine";
export { saveBlockMeta, loadBlockMeta } from "./lib/blockPersistence";
export {
  buildOsc133InjectionScript,
  waitForFirstOsc133,
} from "./lib/sshInjectionScript";
export type {
  BlockMeta,
  BlockMode,
  PositionedBlock,
  VisibleBlocks,
  BlockChromeSettings,
} from "./lib/types";
export { BlockChrome } from "./BlockChrome";
export { BlockInputBar } from "./BlockInputBar";
export { StickyHeader } from "./StickyHeader";
export { BlockSearchBar } from "./BlockSearchBar";
export { BlockOverlay } from "./BlockOverlay";
