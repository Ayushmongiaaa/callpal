import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Force a single React instance. Without this, a dependency can resolve its
    // own copy of react/react-dom and every hook call throws
    // "Invalid hook call / Cannot read properties of null (reading 'useContext')".
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@phosphor-icons/react"],
  },
});
