import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createApiClient } from "../api/client";
import type { InstanceFileItem, InstanceSummary } from "../types";

export default function MemoryPage() {
  const api = useMemo(() => createApiClient(), []);
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [targetId, setTargetId] = useState("");
  const [files, setFiles] = useState<InstanceFileItem[]>([]);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [content, setContent] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [usingCachedContent, setUsingCachedContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileListCacheRef = useRef(new Map<string, InstanceFileItem[]>());
  const fileContentCacheRef = useRef(
    new Map<string, { file: InstanceFileItem; content: string; loadedAt: number }>(),
  );
  const listRequestSeqRef = useRef(0);
  const contentRequestSeqRef = useRef(0);

  const clearEditor = useCallback(() => {
    setSelectedFileName("");
    setContent("");
    setLastLoadedAt(null);
    setUsingCachedContent(false);
  }, []);

  const pickFileName = useCallback((items: InstanceFileItem[], current = "") => {
    if (current && items.some((item) => item.name === current)) {
      return current;
    }
    return items.find((item) => !item.missing)?.name ?? items[0]?.name ?? "";
  }, []);

  const updateFileListCache = useCallback((instanceId: string, nextItems: InstanceFileItem[]) => {
    fileListCacheRef.current.set(instanceId, nextItems);
  }, []);

  const updateFileContentCache = useCallback(
    (instanceId: string, fileName: string, file: InstanceFileItem, nextContent: string) => {
      fileContentCacheRef.current.set(`${instanceId}:${fileName}`, {
        file,
        content: nextContent,
        loadedAt: Date.now(),
      });
    },
    [],
  );

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await api.listInstances();
        if (!active) return;
        setInstances(data);
        if (!targetId && data.length) {
          setTargetId(data[0].id);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [api]);

  const loadFileContent = useCallback(
    async (instanceId: string, fileName: string, options?: { force?: boolean; preserveContent?: boolean }) => {
      const force = options?.force ?? false;
      const preserveContent = options?.preserveContent ?? false;
      const cacheKey = `${instanceId}:${fileName}`;
      if (!force) {
        const cached = fileContentCacheRef.current.get(cacheKey);
        if (cached) {
          setContent(cached.content);
          setLastLoadedAt(cached.loadedAt);
          setUsingCachedContent(true);
          setLoadingContent(false);
          setFiles((current) =>
            current.map((item) => (item.name === fileName ? { ...item, ...cached.file } : item)),
          );
          return;
        }
      }

      const requestSeq = ++contentRequestSeqRef.current;
      setLoadingContent(true);
      setError(null);
      setSuccess(null);
      if (!preserveContent) {
        setContent("");
        setLastLoadedAt(null);
        setUsingCachedContent(false);
      }

      try {
        const file = await api.getInstanceFile(instanceId, fileName);
        if (requestSeq !== contentRequestSeqRef.current) {
          return;
        }
        const nextContent = typeof file.content === "string" ? file.content : "";
        const nextFile = { ...file, name: fileName };
        updateFileContentCache(instanceId, fileName, nextFile, nextContent);
        const cacheEntry = fileContentCacheRef.current.get(cacheKey);
        setContent(nextContent);
        setLastLoadedAt(cacheEntry?.loadedAt ?? Date.now());
        setUsingCachedContent(false);
        setFiles((current) =>
          current.map((item) => (item.name === fileName ? { ...item, ...nextFile } : item)),
        );
      } catch (err) {
        if (requestSeq !== contentRequestSeqRef.current) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (requestSeq === contentRequestSeqRef.current) {
          setLoadingContent(false);
        }
      }
    },
    [api, updateFileContentCache],
  );

  useEffect(() => {
    if (!targetId) {
      setFiles([]);
      clearEditor();
      return;
    }

    async function loadFiles() {
      const requestSeq = ++listRequestSeqRef.current;
      setLoadingFiles(true);
      setError(null);
      setSuccess(null);
      clearEditor();

      const cachedItems = fileListCacheRef.current.get(targetId);
      if (cachedItems) {
        setFiles(cachedItems);
        setSelectedFileName(pickFileName(cachedItems));
        setLoadingFiles(false);
        return;
      }

      try {
        const items = await api.listInstanceFiles(targetId);
        if (requestSeq !== listRequestSeqRef.current) return;
        updateFileListCache(targetId, items);
        setFiles(items);
        setSelectedFileName(pickFileName(items));
      } catch (err) {
        if (requestSeq !== listRequestSeqRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (requestSeq === listRequestSeqRef.current) {
          setLoadingFiles(false);
        }
      }
    }
    void loadFiles();
  }, [api, clearEditor, pickFileName, targetId, updateFileListCache]);

  useEffect(() => {
    if (!targetId || !selectedFileName) {
      setContent("");
      setLastLoadedAt(null);
      setUsingCachedContent(false);
      return;
    }
    void loadFileContent(targetId, selectedFileName);
  }, [loadFileContent, selectedFileName, targetId]);

  async function handleSave() {
    if (!targetId || !selectedFileName) {
      setError("请选择实例和文件");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api.updateInstanceFile(targetId, selectedFileName, { content });
      const nextFile = { ...(result.file ?? {}), name: selectedFileName, missing: false };
      setFiles((current) => {
        const nextItems = current.map((item) =>
          item.name === selectedFileName ? { ...item, ...nextFile } : item,
        );
        updateFileListCache(targetId, nextItems);
        return nextItems;
      });
      updateFileContentCache(targetId, selectedFileName, nextFile, result.file?.content ?? content);
      const cacheEntry = fileContentCacheRef.current.get(`${targetId}:${selectedFileName}`);
      setContent(result.file?.content ?? content);
      setLastLoadedAt(cacheEntry?.loadedAt ?? Date.now());
      setUsingCachedContent(false);
      setSuccess(`已保存 ${selectedFileName}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const currentInstance = instances.find((instance) => instance.id === targetId);
  const currentFile = files.find((item) => item.name === selectedFileName);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>文件与记忆</h1>
          <p>直接编辑 Fleet 托管的工作区文件，适合统一维护 Agent 记忆与提示词。</p>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}
      {success ? <div className="success">{success}</div> : null}

      <div className="files-layout" data-testid="files-layout">
        <aside className="card files-sidebar" data-testid="files-sidebar">
          <div className="stack">
            <label>
              实例
              <select
                value={targetId}
                onChange={(event) => {
                  setFiles([]);
                  clearEditor();
                  setSuccess(null);
                  setError(null);
                  setTargetId(event.target.value);
                }}
              >
                <option value="">选择实例</option>
                {instances.map((instance) => (
                  <option key={instance.id} value={instance.id}>
                    {instance.display_name || instance.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="section-title">支持编辑的文件</div>
            <div className="hint">
              {currentInstance ? `当前实例：${currentInstance.display_name || currentInstance.name}` : "请先选择实例"}
            </div>
            {loadingFiles ? <div className="hint">文件列表加载中...</div> : null}
            <div className="file-list">
              {files.map((file) => (
                <button
                  key={file.name}
                  type="button"
                  aria-label={file.name}
                  className={file.name === selectedFileName ? "file-item active" : "file-item"}
                  onClick={() => setSelectedFileName(file.name)}
                >
                  <div className="strong">{file.name}</div>
                  <div className="muted small">{file.missing ? "缺失，保存后创建" : "已托管"}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>
        <section className="card files-editor" data-testid="files-editor">
          <div className="stack">
            <div className="editor-header">
              <div className="section-title">{selectedFileName || "请选择文件"}</div>
              <div className="row-actions">
                <button
                  type="button"
                  className="ghost"
                  disabled={!targetId || !selectedFileName || loadingContent}
                  onClick={() => {
                    if (!targetId || !selectedFileName) return;
                    void loadFileContent(targetId, selectedFileName, { force: true, preserveContent: true });
                  }}
                >
                  刷新
                </button>
                <button type="button" onClick={handleSave} disabled={!targetId || !selectedFileName || saving}>
                  {saving ? "保存中..." : "保存文件"}
                </button>
              </div>
            </div>
            <div className="hint">
              {currentFile?.missing ? "该文件当前不存在，保存后会创建。" : "直接修改后点击“保存文件”即可下发。"}
            </div>
            {usingCachedContent ? <div className="hint">当前为缓存内容，可点击刷新获取最新版本</div> : null}
            {lastLoadedAt ? <div className="hint">上次加载时间：{new Date(lastLoadedAt).toLocaleString()}</div> : null}
            {loadingContent ? <div className="hint">文件内容加载中...</div> : null}
            <label className="stack">
              <span>文件内容</span>
              <textarea
                className="editor-textarea"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                disabled={!selectedFileName}
              />
            </label>
          </div>
        </section>
      </div>
    </section>
  );
}
