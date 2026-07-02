import type React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { EditorPaneHandle } from "@/modules/editor";

export interface CloseDialogsProps {
  pendingSaveTab: { id: number; title: string } | null;
  setPendingSaveTab: (v: { id: number; title: string } | null) => void;
  pendingDirtyTab: { id: number; title: string } | null;
  setPendingDirtyTab: (v: { id: number; title: string } | null) => void;
  pendingCloseTabId: number | null;
  setPendingCloseTabId: (id: number | null) => void;
  disposeTab: (id: number) => void;
  editorRefs: React.MutableRefObject<Map<number, EditorPaneHandle>>;
}

export function CloseDialogs({
  pendingSaveTab,
  setPendingSaveTab,
  pendingDirtyTab,
  setPendingDirtyTab,
  pendingCloseTabId,
  setPendingCloseTabId,
  disposeTab,
  editorRefs,
}: CloseDialogsProps) {
  return (
    <>
      <AlertDialog
        open={pendingSaveTab !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSaveTab(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save before closing?</AlertDialogTitle>
            <AlertDialogDescription>"{pendingSaveTab?.title}" has not been saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                const tab = pendingSaveTab;
                if (!tab) return;
                disposeTab(tab.id);
                setPendingSaveTab(null);
              }}
            >
              Don't Save
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const tab = pendingSaveTab;
                if (!tab) return;
                const h = editorRefs.current.get(tab.id);
                if (h) await h.save();
                disposeTab(tab.id);
                setPendingSaveTab(null);
              }}
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDirtyTab !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDirtyTab(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close with unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDirtyTab?.title}" has unsaved changes. They will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const tab = pendingDirtyTab;
                if (!tab) return;
                disposeTab(tab.id);
                setPendingDirtyTab(null);
              }}
            >
              Close Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingCloseTabId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingCloseTabId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close terminal tab?</AlertDialogTitle>
            <AlertDialogDescription>The running shell process will be terminated.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingCloseTabId !== null) disposeTab(pendingCloseTabId);
                setPendingCloseTabId(null);
              }}
            >
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
