import { NavLink } from "react-router-dom";

const items = [
  { to: "/", label: "Dashboard" },
  { to: "/options-chain", label: "Options Chain" },
  { to: "/watch-list", label: "Watch List" },
  { to: "/orders", label: "Orders" },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">Wicks to Welath</div>
      <nav className="nav">
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
            end={i.to === "/"}
          >
            {i.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
