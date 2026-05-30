import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from '@/routes/Login';
import { Register } from '@/routes/Register';
import Wall from '@/routes/Wall';
import PublicNote from '@/routes/PublicNote';
import { AuthLayout } from '@/components/Layout/AuthLayout';
import { useAuthStore } from '@/stores/authStore';

function App() {
  const { user } = useAuthStore();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const init = async () => {
      await useAuthStore.getState().checkAuth();
      setIsInitializing(false);
    };
    init();
  }, []);

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-amber-500 text-lg">加载中...</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/wall"
          element={
            user ? (
              <AuthLayout>
                <Wall />
              </AuthLayout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route path="/share/:token" element={<PublicNote />} />
        <Route path="*" element={<Navigate to={user ? "/wall" : "/login"} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;