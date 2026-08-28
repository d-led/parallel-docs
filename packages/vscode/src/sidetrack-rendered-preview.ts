import {
  type BlockScrollLink,
  type SideTrackIndex,
  buildBlockScrollLinks,
  defaultMetadataIndexPath,
  pickSideTrackLineForSourceDualPane,
  pickSourceLine0ForSideTrackScroll,
  readIndex,
} from "@sidetrack/core";
import {
  type SideTrackOutputUrlOptions,
  renderSideTrackPreviewHtml,
} from "@sidetrack/render/companion-markdown-preview";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  isInsideDirectory,
  parseLineColumnFragment,
  resolveWorkspaceHrefToAbsolutePath,
  routePreviewHref,
} from "./sidetrack-preview-linking.js";

export type SideTrackRenderedPreviewOpenArgs = {
  repoRoot: string;
  storageDir: string;
  sourceRelative: string;
  sidetrackPathRel: string;
  sidetrackUri: vscode.Uri;
  sourceEditor: vscode.TextEditor;
  /** When preview closes, restore editor↔markdown scroll sync if it was active. */
  restoreEditorScrollSync: () => void;
  /** Call before binding preview scroll so editor pair sync does not fight preview sync. */
  pauseEditorScrollSync: () => void;
};

async function readSideTrackIndexOrNull(repoRoot: string): Promise<SideTrackIndex | null> {
  try {
    return await readIndex(repoRoot);
  } catch {
    return null;
  }
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function ratioSideTrackLineFromSourceScroll(
  codeDoc: vscode.TextDocument,
  mdDoc: vscode.TextDocument,
  range: vscode.Range,
): number {
  const codeLines = Math.max(1, codeDoc.lineCount);
  const sidetrackLines = Math.max(1, mdDoc.lineCount);
  const center = (range.start.line + range.end.line) / 2;
  const fraction = center / Math.max(1, codeLines - 1);
  return Math.min(sidetrackLines - 1, Math.max(0, Math.round(fraction * (sidetrackLines - 1))));
}

function ratioSourceLine0FromSideTrackScroll(
  codeDoc: vscode.TextDocument,
  mdDoc: vscode.TextDocument,
  topMdLine0: number,
): number {
  const sidetrackLines = Math.max(1, mdDoc.lineCount);
  const codeLines = Math.max(1, codeDoc.lineCount);
  const fraction = topMdLine0 / Math.max(1, sidetrackLines - 1);
  return Math.min(codeLines - 1, Math.max(0, Math.round(fraction * (codeLines - 1))));
}

function previewOutputUrls(
  repoRoot: string,
  storageDir: string,
  sidetrackMdAbs: string,
): SideTrackOutputUrlOptions {
  const htmlDir = path.join(repoRoot, storageDir, "_vscode-preview", "shell");
  const htmlFile = path.join(htmlDir, "preview.html");
  return {
    repoRootAbs: repoRoot,
    htmlOutputFileAbs: htmlFile,
    markdownUrlBaseDirAbs: path.dirname(sidetrackMdAbs),
    sidetrackStorageRootAbs: path.join(repoRoot, storageDir),
  };
}

/**
 * Handles `http:` / `https:` via the OS browser. Any other `scheme:` href is ignored here (not
 * resolved as a workspace path). Returns whether the caller should skip local path resolution.
 */
async function openExternalUrlIfApplicable(href: string): Promise<boolean> {
  const route = routePreviewHref(href);
  if (route === "ignore") return true;
  if (route !== "external") return false;
  const uri = vscode.Uri.parse(href.trim());
  if (uri.scheme === "http" || uri.scheme === "https") {
    await vscode.env.openExternal(uri);
  }
  return true;
}

async function revealWorkspaceFile(
  resolvedAbs: string,
  line?: number,
  char?: number,
): Promise<void> {
  const uri = vscode.Uri.file(resolvedAbs);
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    const ed = await vscode.window.showTextDocument(doc, {
      preview: true,
      viewColumn: vscode.ViewColumn.One,
    });
    if (line !== undefined) {
      const pos = new vscode.Position(line, char ?? 0);
      ed.selection = new vscode.Selection(pos, pos);
      ed.revealRange(
        new vscode.Range(pos, pos),
        vscode.TextEditorRevealType.InCenterIfOutsideViewport,
      );
    }
  } catch {
    void vscode.window.showWarningMessage(`Could not open: ${path.basename(resolvedAbs)}`);
  }
}

function rewriteImgSrcForWebview(
  html: string,
  webview: vscode.Webview,
  htmlDirAbs: string,
  repoRoot: string,
): string {
  const htmlDir = path.resolve(htmlDirAbs);
  const root = path.resolve(repoRoot);
  return html.replace(/<img\b([^>]*?)\bsrc="([^"]+)"/gi, (_full, before: string, src: string) => {
    const t = src.trim();
    if (t.length === 0 || t.startsWith("data:") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) {
      return `<img${before}src="${src}"`;
    }
    let resolved: string;
    try {
      const dec = decodeURIComponent(t);
      resolved = t.startsWith("/")
        ? path.normalize(path.join(root, dec.replace(/^\/+/, "")))
        : path.normalize(path.resolve(htmlDir, dec));
    } catch {
      return `<img${before}src="${src}"`;
    }
    if (!isInsideDirectory(resolved, root)) return `<img${before}src="${src}"`;
    const uri = webview.asWebviewUri(vscode.Uri.file(resolved));
    return `<img${before}src="${uri.toString()}"`;
  });
}

/** Minimal webview bootstrap: scroll sync, in-workspace link opens, no external deps. */
function webviewMainScript(nonce: string): string {
  const js = [
    "(function(){",
    "const vscode=acquireVsCodeApi();",
    "const root=document.getElementById('preview-root');",
    "if(!root)return;",
    "let ignore=false;",
    "function scrollToMdLine(line){",
    "const id='sidetrack-md-line-'+String(line);",
    "const el=document.getElementById(id);",
    "if(!el)return;",
    "ignore=true;",
    "el.scrollIntoView({block:'start',inline:'nearest'});",
    "requestAnimationFrame(function(){ignore=false;});",
    "}",
    "window.addEventListener('message',function(e){",
    "var m=e.data;",
    "if(!m||typeof m!=='object')return;",
    "if(m.type==='scrollToMdLine'&&typeof m.line==='number')scrollToMdLine(m.line);",
    "});",
    "function topMdLineInView(){",
    "var cr=root.getBoundingClientRect();",
    "var pad=4,best=0,bestDist=Infinity;",
    "root.querySelectorAll('[id^=\"sidetrack-md-line-\"]').forEach(function(el){",
    "var id=el.id.slice('sidetrack-md-line-'.length);",
    "var line=parseInt(id,10);",
    "if(isNaN(line))return;",
    "var r=el.getBoundingClientRect();",
    "if(r.bottom<cr.top+pad)return;",
    "if(r.top>cr.bottom)return;",
    "var dist=Math.abs(r.top-cr.top-pad);",
    "if(dist<bestDist){bestDist=dist;best=line;}",
    "});",
    "return best;",
    "}",
    "var scrollTimer=0;",
    "root.addEventListener('scroll',function(){",
    "if(ignore)return;",
    "clearTimeout(scrollTimer);",
    "scrollTimer=setTimeout(function(){",
    "vscode.postMessage({type:'previewScrolled',mdLine0:topMdLineInView()});",
    "},80);",
    "},{passive:true});",
    "root.addEventListener('click',function(e){",
    "var t=e.target;",
    "if(!t||!t.closest)return;",
    "var a=t.closest('a');",
    "if(!a)return;",
    "var hrefRaw=a.getAttribute('href');",
    "if(!hrefRaw||hrefRaw.charAt(0)==='#')return;",
    "e.preventDefault();",
    "e.stopPropagation();",
    "vscode.postMessage({type:'openRepoLink',href:hrefRaw});",
    "},true);",
    "})();",
  ].join("");
  return `<script nonce="${nonce}">${js}</script>`;
}

export class SideTrackRenderedPreviewPanel {
  private static current: SideTrackRenderedPreviewPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private _disposed = false;
  private blocks: BlockScrollLink[] = [];
  private ignorePreviewToSource = false;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private codeDoc: vscode.TextDocument;
  private mdDoc: vscode.TextDocument;
  private readonly htmlDirAbs: string;
  private readonly outputUrls: SideTrackOutputUrlOptions;
  private readonly repoRoot: string;
  private readonly sourceRelative: string;
  private readonly sidetrackPathRel: string;
  private readonly restoreEditorScrollSync: () => void;

  private constructor(
    panel: vscode.WebviewPanel,
    init: {
      codeDoc: vscode.TextDocument;
      mdDoc: vscode.TextDocument;
      htmlDirAbs: string;
      outputUrls: SideTrackOutputUrlOptions;
      repoRoot: string;
      sourceRelative: string;
      sidetrackPathRel: string;
      blocks: BlockScrollLink[];
      restoreEditorScrollSync: () => void;
    },
  ) {
    this.panel = panel;
    this.codeDoc = init.codeDoc;
    this.mdDoc = init.mdDoc;
    this.htmlDirAbs = init.htmlDirAbs;
    this.outputUrls = init.outputUrls;
    this.repoRoot = init.repoRoot;
    this.sourceRelative = init.sourceRelative;
    this.sidetrackPathRel = init.sidetrackPathRel;
    this.blocks = init.blocks;
    this.restoreEditorScrollSync = init.restoreEditorScrollSync;

    this.disposables.push(
      panel.onDidDispose(() => this.handlePanelDisposed()),
      panel.webview.onDidReceiveMessage((msg: unknown) => void this.onWebviewMessage(msg)),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document === this.codeDoc || e.document === this.mdDoc) this.scheduleRefresh();
      }),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        const indexAbs = path.join(this.repoRoot, ...defaultMetadataIndexPath().split("/"));
        if (doc.uri.fsPath === indexAbs) void this.refreshBlocksAndHtml();
      }),
      vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
        if (e.textEditor.document !== this.codeDoc) return;
        this.syncPreviewScrollFromSource(e.visibleRanges[0]);
      }),
    );
  }

  static disposeIfOpen(): void {
    const c = SideTrackRenderedPreviewPanel.current;
    if (!c || c._disposed) return;
    c.panel.dispose();
  }

  private handlePanelDisposed(): void {
    if (this._disposed) return;
    this._disposed = true;
    if (this.refreshTimer !== undefined) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    if (SideTrackRenderedPreviewPanel.current === this) {
      SideTrackRenderedPreviewPanel.current = undefined;
      this.restoreEditorScrollSync();
    }
  }

  private scheduleRefresh(): void {
    if (this._disposed) return;
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.refreshBlocksAndHtml();
    }, 150);
  }

  private async refreshBlocksAndHtml(): Promise<void> {
    if (this._disposed) return;
    this.codeDoc = this.refreshDocRef(this.codeDoc);
    this.mdDoc = this.refreshDocRef(this.mdDoc);
    const index = await readSideTrackIndexOrNull(this.repoRoot);
    this.blocks = buildBlockScrollLinks(
      index,
      this.sourceRelative,
      this.sidetrackPathRel,
      this.mdDoc.getText(),
      this.codeDoc.getText(),
    );
    await this.pushHtml();
  }

  private refreshDocRef(doc: vscode.TextDocument): vscode.TextDocument {
    const open = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString() === doc.uri.toString(),
    );
    return open ?? doc;
  }

  private async onWebviewMessage(msg: unknown): Promise<void> {
    if (!msg || typeof msg !== "object") return;
    const type = Reflect.get(msg, "type");
    if (type === "previewScrolled") {
      const line = Reflect.get(msg, "mdLine0");
      if (typeof line !== "number") return;
      this.syncSourceScrollFromPreviewLine(line);
      return;
    }
    if (type === "openRepoLink") {
      const href = Reflect.get(msg, "href");
      if (typeof href !== "string") return;
      await this.openRepoHref(href);
    }
  }

  private async openRepoHref(href: string): Promise<void> {
    if (await openExternalUrlIfApplicable(href)) return;
    const resolved = resolveWorkspaceHrefToAbsolutePath(href, this.htmlDirAbs, this.repoRoot);
    if (!resolved) return;
    const hashIdx = href.indexOf("#");
    let line: number | undefined;
    let char: number | undefined;
    if (hashIdx >= 0) {
      const parsed = parseLineColumnFragment(href.slice(hashIdx + 1));
      if (parsed) {
        line = parsed.line;
        char = parsed.char;
      }
    }
    await revealWorkspaceFile(resolved, line, char);
  }

  private syncPreviewScrollFromSource(range: vscode.Range | undefined): void {
    if (this._disposed || !range || this.ignorePreviewToSource) return;
    const topSourceLine = range.start.line + 1;
    const mdLine = pickSideTrackLineForSourceDualPane(
      this.blocks,
      topSourceLine,
      this.mdDoc.lineCount,
      () => ratioSideTrackLineFromSourceScroll(this.codeDoc, this.mdDoc, range),
    );
    this.panel.webview.postMessage({ type: "scrollToMdLine", line: mdLine });
  }

  private syncSourceScrollFromPreviewLine(mdLine0: number): void {
    if (this._disposed) return;
    const editor = vscode.window.visibleTextEditors.find((e) => e.document === this.codeDoc);
    if (!editor) return;
    const sourceLine0 =
      pickSourceLine0ForSideTrackScroll(this.blocks, mdLine0) ??
      ratioSourceLine0FromSideTrackScroll(this.codeDoc, this.mdDoc, mdLine0);
    this.ignorePreviewToSource = true;
    try {
      const pos = new vscode.Position(sourceLine0, 0);
      editor.revealRange(
        new vscode.Range(pos, pos),
        vscode.TextEditorRevealType.InCenterIfOutsideViewport,
      );
    } finally {
      setTimeout(() => {
        this.ignorePreviewToSource = false;
      }, 32);
    }
  }

  private async pushHtml(): Promise<void> {
    if (this._disposed) return;
    const nonce = getNonce();
    const body = await renderSideTrackPreviewHtml({
      markdown: this.mdDoc.getText(),
      blockScrollLinks: this.blocks,
      pipeline: { sidetrackOutputUrls: this.outputUrls },
    });
    const withImgs = rewriteImgSrcForWebview(
      body,
      this.panel.webview,
      this.htmlDirAbs,
      this.repoRoot,
    );
    const csp = [
      `default-src 'none'`,
      `img-src ${this.panel.webview.cspSource} https: data:`,
      `style-src ${this.panel.webview.cspSource} 'unsafe-inline'`,
      `font-src ${this.panel.webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");
    this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); }
    #preview-root { box-sizing: border-box; height: 100vh; overflow: auto; padding: 12px 16px 48px; }
    #preview-root .sidetrack-line-anchor { scroll-margin-top: 12px; }
    #preview-root img { max-width: 100%; height: auto; }
    #preview-root a { color: var(--vscode-textLink-foreground); }
    #preview-root pre { overflow: auto; }

    /* highlight.js theme — minimal inline, no CDN */
    .hljs { color: var(--vscode-editor-foreground); background: var(--vscode-textCodeBlock-background); }
    .hljs-comment, .hljs-quote { color: var(--vscode-terminal-ansiGreen, #6a9955); font-style: italic; }
    .hljs-keyword, .hljs-selector-tag, .hljs-type { color: var(--vscode-terminal-ansiBlue, #569cd6); }
    .hljs-string, .hljs-regexp, .hljs-addition { color: var(--vscode-terminal-ansiRed, #ce9178); }
    .hljs-number, .hljs-literal, .hljs-symbol, .hljs-bullet { color: var(--vscode-terminal-ansiCyan, #b5cea8); }
    .hljs-title, .hljs-section, .hljs-name { color: var(--vscode-terminal-ansiYellow, #dcdcaa); }
    .hljs-attr, .hljs-attribute, .hljs-variable, .hljs-template-variable { color: var(--vscode-terminal-ansiCyan, #9cdcfe); }
    .hljs-built_in, .hljs-selector-class, .hljs-selector-id, .hljs-selector-attr, .hljs-selector-pseudo { color: var(--vscode-terminal-ansiYellow, #dcdcaa); }
    .hljs-meta { color: var(--vscode-terminal-ansiMagenta, #c586c0); }
    .hljs-tag { color: var(--vscode-terminal-ansiBlue, #569cd6); }
    .hljs-deletion { color: var(--vscode-terminal-ansiRed, #ce9178); }
    .hljs-emphasis { font-style: italic; }
    .hljs-strong { font-weight: bold; }
    .hljs-link { text-decoration: underline; }
    .hljs-formula { font-style: italic; }
    .hljs-params { color: var(--vscode-editor-foreground); }
  </style>
</head>
<body>
  <div id="preview-root">${withImgs}</div>
  ${webviewMainScript(nonce)}
</body>
</html>`;
  }

  static async openOrReveal(args: SideTrackRenderedPreviewOpenArgs): Promise<void> {
    args.pauseEditorScrollSync();
    SideTrackRenderedPreviewPanel.disposeIfOpen();

    const sidetrackMdAbs = args.sidetrackUri.fsPath;
    const htmlDirAbs = path.join(args.repoRoot, args.storageDir, "_vscode-preview", "shell");
    const outputUrls = previewOutputUrls(args.repoRoot, args.storageDir, sidetrackMdAbs);

    const mdDoc = await vscode.workspace.openTextDocument(args.sidetrackUri);
    const index = await readSideTrackIndexOrNull(args.repoRoot);
    const blocks = buildBlockScrollLinks(
      index,
      args.sourceRelative,
      args.sidetrackPathRel,
      mdDoc.getText(),
      args.sourceEditor.document.getText(),
    );

    const title = `SideTrack preview — ${path.basename(args.sourceRelative)}`;
    const panel = vscode.window.createWebviewPanel(
      "sidetrack.renderedPreview",
      title,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(args.repoRoot),
          vscode.Uri.file(path.join(args.repoRoot, args.storageDir)),
        ],
      },
    );

    const instance = new SideTrackRenderedPreviewPanel(panel, {
      codeDoc: args.sourceEditor.document,
      mdDoc,
      htmlDirAbs,
      outputUrls,
      repoRoot: args.repoRoot,
      sourceRelative: args.sourceRelative,
      sidetrackPathRel: args.sidetrackPathRel,
      blocks,
      restoreEditorScrollSync: args.restoreEditorScrollSync,
    });
    SideTrackRenderedPreviewPanel.current = instance;
    await instance.pushHtml();
    const ed = vscode.window.visibleTextEditors.find(
      (e) => e.document === args.sourceEditor.document,
    );
    const initial = ed?.visibleRanges[0];
    if (initial) instance.syncPreviewScrollFromSource(initial);
  }
}
