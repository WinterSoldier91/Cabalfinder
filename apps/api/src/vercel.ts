import { buildServer } from "./server.js";

const server = await buildServer();

export default async (req: any, res: any) => {
  await server.ready();
  server.server.emit("request", req, res);
};
