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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { handleApiError } from "@/lib/errors";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCredentialsStore } from "../store/credentialsStore";
import { useHostsStore } from "../store/hostsStore";
import type { Credential, HostRef } from "../types";

interface Props {
  credentialId: string | null;
  onClose: () => void;
}

type CredType = "password" | "key";
type KeySource = "filepath" | "generate";
type KeyType = "ed25519" | "rsa-4096";

interface FormState {
  name: string;
  cred_type: CredType;
  key_source: KeySource;
  key_path: string;
  key_type: KeyType;
  secret: string;
  public_key: string;
}

function credToForm(cred: Credential): FormState {
  return {
    name: cred.name,
    cred_type: cred.cred_type,
    key_source: cred.key_path ? "filepath" : "generate",
    key_path: cred.key_path ?? "",
    key_type: (cred.key_type as KeyType) ?? "ed25519",
    secret: "",
    public_key: cred.public_key ?? "",
  };
}

const DEFAULT_FORM: FormState = {
  name: "",
  cred_type: "password",
  key_source: "filepath",
  key_path: "",
  key_type: "ed25519",
  secret: "",
  public_key: "",
};

export function CredentialFormPanel({ credentialId, onClose }: Props) {
  const isNew = credentialId === "__new__" || credentialId === null;

  const cred = useCredentialsStore((s) =>
    isNew ? null : (s.credentials.find((c) => c.id === credentialId) ?? null)
  );
  const createCredential = useCredentialsStore((s) => s.createCredential);
  const updateCredential = useCredentialsStore((s) => s.updateCredential);
  const deleteCredential = useCredentialsStore((s) => s.deleteCredential);
  const generateKeypair = useCredentialsStore((s) => s.generateKeypair);
  const getHostsUsing = useCredentialsStore((s) => s.getHostsUsing);
  const setSelectedCredential = useCredentialsStore((s) => s.setSelectedCredential);
  const fetchData = useHostsStore((s) => s.fetchData);

  const [form, setForm] = useState<FormState>(isNew ? DEFAULT_FORM : (cred ? credToForm(cred) : DEFAULT_FORM));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedOnce, setSubmittedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedByHosts, setUsedByHosts] = useState<HostRef[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteAffected, setDeleteAffected] = useState<HostRef[]>([]);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isNew && cred) {
      setForm(credToForm(cred));
    }
  }, [credentialId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isNew && credentialId) {
      getHostsUsing(credentialId).then(setUsedByHosts).catch(() => {});
    }
  }, [credentialId, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBlur = useCallback(async () => {
    if (isNew || !cred) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        const payload: Parameters<typeof updateCredential>[0] = { id: cred.id };
        payload.name = form.name;
        payload.credType = form.cred_type;
        if (form.cred_type === "key") {
          payload.keyPath = form.key_path || undefined;
          payload.keyType = form.key_type;
          if (form.public_key) payload.publicKey = form.public_key;
        }
        if (form.secret !== "") payload.secret = form.secret;
        await updateCredential(payload);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } finally {
        setSaving(false);
      }
    }, 300);
  }, [isNew, cred, form, updateCredential]);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setSubmittedOnce(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const newCred = await createCredential({
        name: form.name.trim(),
        credType: form.cred_type,
        keyPath: form.cred_type === "key" && form.key_source === "filepath" ? form.key_path || undefined : undefined,
        keyType: form.cred_type === "key" ? form.key_type : undefined,
        publicKey: form.public_key || undefined,
        secret: form.secret || undefined,
      });
      setSelectedCredential(newCred.id);
    } catch (e) {
      setError(String(e));
      handleApiError(e, "Failed to create credential", "Hosts");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClick = async () => {
    if (!cred) return;
    const affected = await getHostsUsing(cred.id);
    setDeleteAffected(affected);
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!cred) return;
    await deleteCredential(cred.id);
    await fetchData();
    onClose();
  };

  const handleGenerate = async () => {
    if (!cred) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await generateKeypair(cred.id, form.key_type, form.secret || undefined);
      setForm((d) => ({ ...d, key_path: result.key_path, public_key: result.public_key }));
    } catch (e) {
      setError(String(e));
      handleApiError(e, "Failed to generate keypair", "Hosts");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyPublicKey = async () => {
    const key = form.public_key || cred?.public_key;
    if (!key) return;
    await navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canCreate = form.name.trim().length > 0;
  const displayedPublicKey = form.public_key || cred?.public_key || "";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 sticky top-0 bg-background z-10">
        <div className="min-w-0 flex-1">
          <input
            value={form.name}
            onChange={(e) => setForm((d) => ({ ...d, name: e.target.value }))}
            onBlur={handleBlur}
            placeholder={isNew ? "New Credential" : "Credential name"}
            className="w-full bg-transparent text-base font-semibold text-foreground outline-none placeholder:text-muted-foreground"
          />
          {saving && <p className="text-[11px] text-muted-foreground">Saving…</p>}
          {saved && !saving && <p className="text-[11px] text-success">Saved</p>}
          {isNew && <p className="text-[11px] text-muted-foreground">New credential</p>}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Name */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</p>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Credential Name <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="e.g. Production SSH Key"
              value={form.name}
              onChange={(e) => { setForm((d) => ({ ...d, name: e.target.value })); if (submittedOnce) setSubmittedOnce(false); }}
              onBlur={handleBlur}
              className={cn("h-8 text-sm bg-background", submittedOnce && !form.name.trim() && "border-destructive")}
            />
            {submittedOnce && !form.name.trim() && (
              <p className="text-[11px] text-destructive">Name is required</p>
            )}
          </div>
        </section>

        {/* Type */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Credential Type</p>
          <div className="flex gap-1.5">
            {(["password", "key"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setForm((d) => ({ ...d, cred_type: t })); setTimeout(handleBlur, 0); }}
                className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-all ${
                  form.cred_type === t
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-accent"
                }`}
              >
                {t === "password" ? "Password" : "SSH Key"}
              </button>
            ))}
          </div>
        </section>

        {/* Password section */}
        {form.cred_type === "password" && (
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Password</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Password</Label>
                {cred && (
                  <span className={`text-[11px] ${cred.has_secret ? "text-success" : "text-muted-foreground"}`}>
                    {cred.has_secret ? "Saved" : "Not set"}
                  </span>
                )}
              </div>
              <Input
                type="password"
                placeholder={cred?.has_secret ? "Enter to update, leave empty to keep" : "Enter password"}
                value={form.secret}
                onChange={(e) => setForm((d) => ({ ...d, secret: e.target.value }))}
                onBlur={handleBlur}
                className="h-8 text-sm bg-background"
              />
              <p className="text-[11px] text-muted-foreground">Stored in local encrypted secrets store</p>
            </div>
          </section>
        )}

        {/* SSH Key section */}
        {form.cred_type === "key" && (
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">SSH Key</p>

            {/* Key source toggle */}
            <div className="flex gap-1.5">
              {(["filepath", "generate"] as const).map((src) => (
                <button
                  key={src}
                  onClick={() => setForm((d) => ({ ...d, key_source: src }))}
                  className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-all ${
                    form.key_source === src
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {src === "filepath" ? "File Path" : "Generate"}
                </button>
              ))}
            </div>

            {/* File path */}
            {form.key_source === "filepath" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Private Key Path</Label>
                  <Input
                    placeholder="~/.ssh/id_ed25519"
                    value={form.key_path}
                    onChange={(e) => setForm((d) => ({ ...d, key_path: e.target.value }))}
                    onBlur={handleBlur}
                    className="h-8 text-sm bg-background font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Passphrase (optional)</Label>
                    {cred?.has_secret && (
                      <span className="text-[11px] text-success">Saved</span>
                    )}
                  </div>
                  <Input
                    type="password"
                    placeholder={cred?.has_secret ? "Enter to update, leave empty to keep" : "Leave empty if none"}
                    value={form.secret}
                    onChange={(e) => setForm((d) => ({ ...d, secret: e.target.value }))}
                    onBlur={handleBlur}
                    className="h-8 text-sm bg-background"
                  />
                </div>
              </div>
            )}

            {/* Generate */}
            {form.key_source === "generate" && (
              <div className="space-y-3">
                {/* Key type */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Key Type</Label>
                  <div className="flex gap-1.5">
                    {(["ed25519", "rsa-4096"] as const).map((kt) => (
                      <button
                        key={kt}
                        onClick={() => setForm((d) => ({ ...d, key_type: kt }))}
                        className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-all ${
                          form.key_type === kt
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {kt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Passphrase for generate */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Passphrase (optional)</Label>
                    {cred?.has_secret && (
                      <span className="text-[11px] text-success">Saved</span>
                    )}
                  </div>
                  <Input
                    type="password"
                    placeholder="Leave empty for no passphrase"
                    value={form.secret}
                    onChange={(e) => setForm((d) => ({ ...d, secret: e.target.value }))}
                    className="h-8 text-sm bg-background"
                  />
                </div>

                {/* Generate button — only available in edit mode (needs a cred ID) */}
                {!isNew ? (
                  <Button
                    size="sm"
                    className="w-full h-8 text-xs"
                    onClick={handleGenerate}
                    disabled={generating}
                  >
                    {generating ? "Generating…" : `Generate ${form.key_type} Key Pair`}
                  </Button>
                ) : (
                  <p className="text-[11px] text-muted-foreground text-center py-1">
                    Save the credential first, then generate the key pair.
                  </p>
                )}

                {/* Public key display */}
                {displayedPublicKey && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Public Key</Label>
                      <button
                        onClick={handleCopyPublicKey}
                        className="text-[11px] text-primary hover:underline"
                      >
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <textarea
                      readOnly
                      value={displayedPublicKey}
                      rows={3}
                      className="w-full rounded-md border border-input bg-muted px-3 py-2 text-[11px] font-mono text-muted-foreground resize-none"
                    />
                    {cred?.key_path && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        Private key: {cred.key_path}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Used by hosts */}
        {!isNew && usedByHosts.length > 0 && (
          <section className="rounded-lg border border-border bg-card p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Used by {usedByHosts.length === 1 ? "1 host" : `${usedByHosts.length} hosts`}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {usedByHosts.map((h) => (
                <span
                  key={h.id}
                  className="inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium"
                >
                  {h.name}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Error */}
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 py-3">
        {isNew ? (
          <Button
            className="w-full h-8 text-xs"
            onClick={handleCreate}
            disabled={!canCreate || submitting}
          >
            {submitting ? "Adding…" : "Add Credential"}
          </Button>
        ) : (
          <button
            onClick={handleDeleteClick}
            className="w-full rounded-md border border-destructive/50 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            Delete Credential
          </button>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{cred?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteAffected.length > 0 ? (
                <>
                  The following {deleteAffected.length === 1 ? "host" : `${deleteAffected.length} hosts`} will
                  lose their credential reference and revert to no auth:
                  <ul className="mt-2 space-y-0.5 text-foreground">
                    {deleteAffected.map((h) => (
                      <li key={h.id} className="text-sm">• {h.name}</li>
                    ))}
                  </ul>
                  <span className="mt-2 block">This action cannot be undone.</span>
                </>
              ) : (
                "This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteConfirm}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
