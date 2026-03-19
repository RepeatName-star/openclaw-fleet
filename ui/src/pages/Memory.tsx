import React, { useEffect, useMemo, useState } from "react";
import { createApiClient } from "../api/client";
import type { InstanceFileItem, InstanceSummary } from "../types";

export default function MemoryPage() {
  const api = useMemo(() => createApiClient(), []);
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [targetId, setTargetId] = useState("");
  const [files, setFiles] = useState<InstanceFileItem[]>([]);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);

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
  }, [api, targetId]);

  useEffect(() => {
    if (!targetId) {
      setFiles([]);
      setSelectedFileName("");
      setContent("");
      return;
    }

    let active = true;
    async function loadFiles() {
      setLoadingFiles(true);
      setError(null);
      setSuccess(null);
      try {
        const items = await api.listInstanceFiles(targetId);
        if (!active) return;
        setFiles(items);
        setSelectedFileName((current) => {
          if (current && items.some((item) => item.name === current)) {
            return current;
          }
          return items[0]?.name ?? "";
        });
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!active) return;
        setLoadingFiles(false);
      }
    }
    loadFiles();
    return () => {
      active = false;
    };
  }, [api, targetId]);

  useEffect(() => {
    if (!targetId || !selectedFileName) {
      setContent("");
      return;
    }

    let active = true;
    async function loadFile() {
      setLoadingContent(true);
      setError(null);
      setSuccess(null);
      try {
        const file = await api.getInstanceFile(targetId, selectedFileName);
        if (!active) return;
        setContent(typeof file.content === "string" ? file.content : "");
        setFiles((current) =>
          current.map((item) => (item.name === selectedFileName ? { ...item, ...file } : item)),
        );
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!active) return;
        setLoadingContent(false);
      }
    }
    loadFile();
    return () => {
      active = false;
    };
  }, [api, selectedFileName, targetId]);

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
      setFiles((current) =>
        current.map((item) =>
          item.name === selectedFileName ? { ...item, ...(result.file ?? {}), missing: false } : item,
        ),
      );
      setContent(result.file?.content ?? content);
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
        <button type="button" onClick={handleSave} disabled={!targetId || !selectedFileName || saving}>
          {saving ? "保存中..." : "保存文件"}
        </button>
      </header>

      {error ? <div className="error">{error}</div> : null}
      {success ? <div className="success">{success}</div> : null}

      <div className="grid-two">
        <div className="card stack">
          <label>
            实例
            <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
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
          <div className="stack">
            {files.map((file) => (
              <button
                key={file.name}
                type="button"
                className={file.name === selectedFileName ? "" : "ghost"}
                onClick={() => setSelectedFileName(file.name)}
              >
                {file.name}
              </button>
            ))}
          </div>
        </div>
        <div className="card stack">
          <div className="section-title">{selectedFileName || "请选择文件"}</div>
          <div className="hint">
            {currentFile?.missing ? "该文件当前不存在，保存后会创建。" : "直接修改后点击“保存文件”即可下发。"}
          </div>
          {loadingContent ? <div className="hint">文件内容加载中...</div> : null}
          <label>
            文件内容
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              disabled={!selectedFileName}
            />
          </label>
        </div>
      </div>
    </section>
  );
}
