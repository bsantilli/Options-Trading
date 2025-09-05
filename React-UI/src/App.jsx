//import './App.css';
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppShell from "./layouts/AppShell";
import OptionsChainAgGrid from "./components/OptionsChainAgGrid"; 

const Dashboard = () => <div className="card">Dashboard</div>;
const WatchList = () => <div className="card">Watch List</div>;
const Orders = () => <div className="card">Orders</div>;

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/options-chain" element={<OptionsChainAgGrid />} />
          <Route path="/watch-list" element={<WatchList />} />
          <Route path="/orders" element={<Orders />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
