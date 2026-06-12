import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { Toaster } from '@/shared/ui/toast';
import { EntryPage } from '@/pages/entry/EntryPage';
import { HistoryPage } from '@/pages/history/HistoryPage';
import { ChartsPage } from '@/pages/charts/ChartsPage';
import { DynamicsPage } from '@/pages/dynamics/DynamicsPage';
import { BudgetsPage } from '@/pages/budgets/BudgetsPage';
import { AccountsPage } from '@/pages/accounts/AccountsPage';
import { CategoriesPage } from '@/pages/categories/CategoriesPage';
import { DataPage } from '@/pages/data/DataPage';

const NAV = [
  { to: '/', label: 'Ввод', end: true },
  { to: '/history', label: 'История' },
  { to: '/charts', label: 'Графики' },
  { to: '/dynamics', label: 'Динамика' },
  { to: '/budgets', label: 'Бюджеты' },
  { to: '/accounts', label: 'Счета' },
  { to: '/categories', label: 'Категории' },
  { to: '/data', label: 'Данные' },
];

export function App() {
  return (
    <BrowserRouter>
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            Fin<span>Flow</span>
          </div>
          <nav className="nav" aria-label="Разделы">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav__link${isActive ? ' nav__link--active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="content">
          <Routes>
            <Route path="/" element={<EntryPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/charts" element={<ChartsPage />} />
            <Route path="/dynamics" element={<DynamicsPage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/data" element={<DataPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Toaster />
      </div>
    </BrowserRouter>
  );
}
