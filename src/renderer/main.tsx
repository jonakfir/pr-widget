import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { PrDetail } from './components/PrDetail'
import './styles.css'

// The same bundle serves two windows: the main list, and a standalone PR
// detail window opened with the #detail hash.
const isDetail = window.location.hash === '#detail'
createRoot(document.getElementById('root')!).render(isDetail ? <PrDetail /> : <App />)
