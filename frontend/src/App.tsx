// src/App.tsx
import "./index.css";
import MyMap from "./MyMap";

export default function App() {
  return (
    <div className="h-screen w-screen">
      <div className="p-3 bg-black text-white text-sm">App is mounted ✅</div>
      {/* <PolicyAlertMap /> */}
      <MyMap />
    </div>
  );
}
