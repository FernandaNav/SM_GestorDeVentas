import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router";
import { AuthProvider, useAuth } from "@/auth/AuthContext";
import RequireRole from "@/auth/RequireRole";
import AppShell from "@/layout/AppShell";
import { homePathFor, paths } from "@/layout/navigation";
import { ThemeProvider, useTheme } from "@/layout/theme";
import ClosingPage from "@/pages/closing/ClosingPage";
import CommissionsPage from "@/pages/commissions/CommissionsPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import ExpensesPage from "@/pages/expenses/ExpensesPage";
import EmployeeHomePage from "@/pages/home/EmployeeHomePage";
import LoginPage from "@/pages/login/LoginPage";
import NewSalePage from "@/pages/sales/NewSalePage";
import SalesHistoryPage from "@/pages/sales/SalesHistoryPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import StaffPage from "@/pages/staff/StaffPage";
import StatsPage from "@/pages/stats/StatsPage";
import WorkshopPage from "@/pages/workshop/WorkshopPage";
import { LocalDataProvider, useLocalData } from "@/temporal/LocalDataProvider";

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <LocalDataProvider>
            <AppRoutes />
          </LocalDataProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

// Los permisos por ruta coinciden con NAV_ITEMS (layout/navigation.ts) y con la API.
function AppRoutes() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const theme = useTheme();
  // TEMPORAL: las pantallas sin API reciben los datos locales por props.
  // Al conectar un módulo, su página pide sus datos con useApiQuery y se quitan estas props.
  const local = useLocalData();
  const role = user?.role ?? "Empleado";

  return (
    <Routes>
      <Route path={paths.login} element={<LoginPage />} />

      <Route element={<RequireRole />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to={homePathFor(role)} replace />} />

          {/* Administrador y Empleado */}
          <Route
            path={paths.newSale}
            element={<NewSalePage role={role} onHistory={() => navigate(paths.salesHistory)} onAddSale={local.addSale} />}
          />
          <Route
            path={paths.salesHistory}
            element={
              <SalesHistoryPage
                role={role}
                sales={local.sales}
                onInvoice={() => navigate(paths.salesHistory)}
                onUpdateSale={local.updateSale}
                onDeleteSale={local.deleteSale}
              />
            }
          />
          <Route path={paths.workshop} element={<WorkshopPage />} />

          {/* Solo Empleado */}
          <Route element={<RequireRole roles={["Empleado"]} />}>
            <Route
              path={paths.home}
              element={
                <EmployeeHomePage
                  sales={local.sales}
                  orders={local.workshopOrders}
                  onNewSale={() => navigate(paths.newSale)}
                  onInvoice={() => navigate(paths.salesHistory)}
                  onViewOrder={(id) => navigate(`${paths.workshop}?orden=${encodeURIComponent(id)}`)}
                />
              }
            />
          </Route>

          {/* Solo Administrador */}
          <Route element={<RequireRole roles={["Administrador"]} />}>
            <Route
              path={paths.dashboard}
              element={
                <DashboardPage
                  sales={local.sales}
                  expenses={local.expenses}
                  onNewSale={() => navigate(paths.newSale)}
                  onHistory={() => navigate(paths.salesHistory)}
                />
              }
            />
            <Route path={paths.commissions} element={<CommissionsPage sales={local.sales} onUpdateSale={local.updateSale} />} />
            <Route
              path={paths.stats}
              element={<StatsPage sales={local.sales} expenses={local.expenses} orders={local.workshopOrders} />}
            />
            <Route
              path={paths.expenses}
              element={<ExpensesPage expenses={local.expenses} onAddExpense={local.addExpense} onDeleteExpense={local.deleteExpense} />}
            />
            <Route path={paths.staff} element={<StaffPage />} />
            <Route
              path={paths.closing}
              element={<ClosingPage sales={local.sales} onHistory={() => navigate(paths.salesHistory)} onClosePeriod={local.closePeriod} />}
            />
            <Route
              path={paths.settings}
              element={<SettingsPage dark={theme.dark} onSetDark={theme.setDark} accent={theme.accent} onSetAccent={theme.setAccent} />}
            />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
