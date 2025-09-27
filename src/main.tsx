import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthProvider } from './context/AuthContext'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.tsx'
import Dashboard from './pages/Dashboard.tsx'
import PublicFormPage from './pages/PublicFormPage.tsx'
import ResponsesPage from './pages/ResponsesPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/form/:formId" element={<PublicFormPage />} />
          <Route path="/dashboard/:formId/responses" element={<ResponsesPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
