// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";
import App from "./App";
import Home from "./pages/Home";
import Poker from "./pages/Poker";
import Play from "./pages/Play";
import Formats from "./pages/Formats";
import Docs from "./pages/Docs";
import Connect from "./pages/Connect";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<App />}>
          <Route path="/" element={<Home />} />
          <Route path="/poker" element={<Poker />} />
          <Route path="/play" element={<Play />} />
          <Route path="/formats" element={<Formats />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/connect" element={<Connect />} />
        </Route>
      </Routes>
    </HashRouter>
  </StrictMode>,
);
