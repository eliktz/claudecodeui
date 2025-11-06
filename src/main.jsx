import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  // StrictMode temporarily disabled to debug ASAF panel rendering issues
  // <React.StrictMode>
    <App />
  // </React.StrictMode>,
)