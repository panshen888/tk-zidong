import React from 'react';
import ReactDOM from 'react-dom/client';
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { HomePage } from './pages/HomePage';
import { ListingSettingsPage } from './pages/ListingSettingsPage';
import { ListingPage } from './pages/ListingPage';
import { LoginPage } from './pages/LoginPage';
import { SettingsPage } from './pages/SettingsPage';
import { TasksPage } from './pages/TasksPage';
import { UserGuidePage } from './pages/UserGuidePage';
import { installDevMockApi } from './devMock';
import './styles/global.css';

installDevMockApi();

const router = createHashRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/guide',
    element: <UserGuidePage />,
  },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'tasks/settings', element: <SettingsPage /> },
      { path: 'listing', element: <ListingPage /> },
      { path: 'listing/settings', element: <ListingSettingsPage /> },
      { path: 'settings', element: <Navigate to="/tasks/settings" replace /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
