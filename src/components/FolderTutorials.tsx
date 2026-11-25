import { liveQuery } from "dexie";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { db, type FolderTutorial } from "../storage/db";

const previewPolicy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; form-action 'none'; base-uri 'none'">`;

export function FolderTutorials({ library, folder }: { library: string; folder: string }) {
  const [tutorials, setTutorials] = useState<FolderTutorial[]>([]);
  const [preview, setPreview] = useState<FolderTutorial>();
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const subscription = liveQuery(() =>
      db.tutorials.where("[library+folder]").equals([library, folder]).sortBy("name"),
    ).subscribe({
      next: setTutorials,
      error: () => setMessage("无法读取教程文件。"),
    });
    return () => subscription.unsubscribe();
  }, [library, folder]);

  async function addTutorial(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!/\.html?$/i.test(file.name)) {
      setMessage("请选择 .html 或 .htm 文件。");
      return;
    }
    try {
      await db.tutorials.add({
        id: crypto.randomUUID(),
        library,
        folder,
        name: file.name,
        html: await file.text(),
      });
      setMessage("");
    } catch {
      setMessage("无法保存教程文件。");
    }
  }

  async function removeTutorial(tutorial: FolderTutorial) {
    if (!window.confirm(`移除教程「${tutorial.name}」？`)) return;
    try {
      await db.tutorials.delete(tutorial.id);
      setPreview((current) => current?.id === tutorial.id ? undefined : current);
      setMessage("");
    } catch {
      setMessage("无法移除教程文件。");
    }
  }

  return (
    <section className="folder-tutorials" aria-label={`${folder}的教程`}>
      <input
        ref={input}
        type="file"
        accept=".html,.htm,text/html"
        aria-label="选择教程 HTML 文件"
        hidden
        onChange={(event) => void addTutorial(event)}
      />
      <button type="button" onClick={() => input.current?.click()}>添加教程 HTML</button>
      {message && <p role="status">{message}</p>}
      {tutorials.map((tutorial) => (
        <div className="folder-tutorial-row" key={tutorial.id}>
          <button type="button" onClick={() => setPreview(tutorial)}>{tutorial.name}</button>
          <button type="button" aria-label={`移除教程「${tutorial.name}」`} onClick={() => void removeTutorial(tutorial)}>移除</button>
        </div>
      ))}
      {preview && (
        <>
          <button type="button" onClick={() => setPreview(undefined)}>关闭教程</button>
          <iframe
            title={preview.name}
            sandbox=""
            referrerPolicy="no-referrer"
            srcDoc={"<!doctype html>" + previewPolicy + preview.html}
          />
        </>
      )}
    </section>
  );
}
