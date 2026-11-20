import { createProxy } from "./image-proxy.mjs";
const port = Number(process.env.STORY_PROXY_PORT || 8194);
createProxy().listen(port, "127.0.0.1", () =>
  console.log(`Story proxy http://127.0.0.1:${port}/image`),
);
