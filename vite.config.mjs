import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: { outDir: "dist/client" },
  optimizeDeps: { include: ["react", "react-dom/client"] },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: { clientFiles: ["./src/main.jsx"] },
  },
  plugins: [react(), {
    name: "local-preview-api-status",
    configureServer(server) {
      server.middlewares.use("/api", (_request, response) => {
        response.statusCode = 503;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(JSON.stringify({ error: "本地演示模式不连接 GitHub；请到已部署的测试后台验收真实连接" }));
      });
    },
  }],
});
