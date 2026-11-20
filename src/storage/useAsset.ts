import { useEffect, useState } from "react";
import { db } from "./db";

export function useAssetUrl(id?: string) {
  const [state, setState] = useState<{ id: string; url: string }>();
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let url: string | undefined;
    void db.assets
      .get(id)
      .then((asset) => {
        if (cancelled || !asset) return;
        url = URL.createObjectURL(asset.blob);
        setState({ id, url });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return state?.id === id ? state?.url : undefined;
}
