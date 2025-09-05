import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import "./theme.css";

const rootEl = document.getElementById('root')
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
