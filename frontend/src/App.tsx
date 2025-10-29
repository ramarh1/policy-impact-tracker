// src/App.tsx
import "./index.css";
import BasicMap from "./BasicMap"; // we'll create this next

export default function App() {
  return (
    <div className="h-screen w-screen">
      <div className="p-3 bg-black text-white text-sm">App is mounted ✅</div>
      <BasicMap />
    </div>
  );
}
