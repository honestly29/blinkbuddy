/**
 * Renderer entry point. Mounts the React app into #root in index.html.
 * StrictMode wraps the tree to enable React's development-time checks.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)