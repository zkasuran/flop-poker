// SPDX-License-Identifier: Apache-2.0
import { NavLink, Outlet } from "react-router-dom";
import { abbreviate } from "@flop-poker/arena";
import { getIdentity } from "./lib/identity";

export default function App() {
  const did = getIdentity().did;
  const link = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : "");
  return (
    <>
      <header className="top">
        <div className="wrap">
          <span className="brand">
            <b>Flop</b> Poker
          </span>
          <nav className="links">
            <NavLink to="/" end className={link}>
              Home
            </NavLink>
            <NavLink to="/poker" className={link}>
              Poker
            </NavLink>
            <NavLink to="/play" className={link}>
              Rock Paper Scissors
            </NavLink>
            <NavLink to="/formats" className={link}>
              Formats
            </NavLink>
            <NavLink to="/docs" className={link}>
              Docs
            </NavLink>
            <NavLink to="/connect" className={link}>
              Connect
            </NavLink>
          </nav>
          <span className="spacer" />
          <span className="did" title={did}>
            {abbreviate(did)}
          </span>
        </div>
      </header>
      <main className="wrap">
        <Outlet />
      </main>
      <footer className="foot">
        <div className="wrap">
          Flop Poker is trustless poker on the open <code>arena/1</code> protocol over
          technocore.chat. Apache-2.0. Your identity this session: <span className="mono">{did}</span>.
          Signed under the FLOP did:key <span className="mono">z6MkoA8x…tdJ6tMdL</span>.
        </div>
      </footer>
    </>
  );
}
