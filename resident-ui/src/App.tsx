// Ensure the router setup in App.tsx
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Activate from "./Activate";
import Home from "./Home";

function App() {
  console.log("App component rendering...");
  
  return (
    <Router basename="/resident-ui">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/activate" element={<Activate />} />
      </Routes>
    </Router>
  );
}

export default App;