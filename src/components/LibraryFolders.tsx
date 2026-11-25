import { useState, type FormEvent, type ReactNode } from "react";
import { FolderOpen } from "lucide-react";

type Organization = {
  folders: string[];
  locations: Record<string, string>;
};

type LibraryItem = {
  id: string;
  title: string;
  folder?: string;
};

export function LibraryFolders<T extends LibraryItem>({
  storageKey,
  label,
  items,
  renderItem,
}: {
  storageKey: string;
  label: string;
  items: T[];
  renderItem: (item: T, moveControl: ReactNode) => ReactNode;
}) {
  const [organization, setOrganization] = useState<Organization>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (Array.isArray(saved?.folders) && saved.locations)
        return saved;
    } catch {
      // A fresh layout is usable when browser storage is unavailable.
    }
    return { folders: [], locations: {} };
  });
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const folders = new Map<string, T[]>();
  for (const folder of organization.folders) folders.set(folder, []);
  for (const item of items)
    if (item.folder && !folders.has(item.folder)) folders.set(item.folder, []);

  const unfiled: T[] = [];
  for (const item of items) {
    const members = folders.get(organization.locations[item.id] ?? item.folder ?? "");
    (members ?? unfiled).push(item);
  }

  function save(next: Organization) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setOrganization(next);
      setMessage("");
      return true;
    } catch {
      setMessage("无法保存文件夹设置。");
      return false;
    }
  }

  function createFolder(event: FormEvent) {
    event.preventDefault();
    const folder = name.trim();
    if (!folder) return;
    if (folders.has(folder)) {
      setMessage("已有同名文件夹。");
      return;
    }
    if (save({ ...organization, folders: [...organization.folders, folder] }))
      setName("");
  }

  function renderRow(item: T) {
    return renderItem(
      item,
      folders.size > 0 && (
        <select
          aria-label={`移动「${item.title}」到文件夹`}
          value={organization.locations[item.id] ?? item.folder ?? ""}
          onChange={(event) =>
            save({
              ...organization,
              locations: { ...organization.locations, [item.id]: event.target.value },
            })
          }
        >
          <option value="">未归类</option>
          {[...folders.keys()].map((folder) => (
            <option key={folder} value={folder}>{folder}</option>
          ))}
        </select>
      ),
    );
  }

  return (
    <>
      <form className="library-folder-form" onSubmit={createFolder}>
        <input
          aria-label={`${label}文件夹名称`}
          placeholder="文件夹名称"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" disabled={!name.trim()}>新建文件夹</button>
      </form>
      {message && <p role="status">{message}</p>}
      {[...folders].map(([folder, members]) => (
        <details className="library-folder" key={folder}>
          <summary>
            <FolderOpen size={20} aria-hidden="true" />
            <strong>{folder}</strong>
            <small>{members.length} 个故事</small>
          </summary>
          {members.length ? members.map(renderRow) : <p className="muted">空文件夹</p>}
        </details>
      ))}
      {unfiled.map(renderRow)}
    </>
  );
}
