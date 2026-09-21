import fs from 'fs';
let code = fs.readFileSync('src/App.jsx', 'utf8');

const regex = /^import\s+([A-Za-z0-9_]+)\s+from\s+['"]([^'"]+)['"];$/gm;
let newCode = code.replace(regex, (match, p1, p2) => {
  const criticalImports = ['React', 'Toaster', 'QueryClientProvider', 'sajilo', 'queryClientInstance', 'createBrowserRouter', 'RouterProvider', 'Route', 'Routes', 'Navigate', 'PageNotFound', 'AuthProvider', 'useAuth', 'DateFormatProvider', 'UserNotRegisteredError', 'ProtectedRoute', 'SonnerToaster', 'ThemeProvider', 'ModalRegistry', 'useModalStore', 'ERPLayout', 'Login', 'Register', 'ForgotPassword', 'ResetPassword', 'ChangePassword', 'Onboarding', 'Dashboard'];
  if (criticalImports.includes(p1) || p1.startsWith('{') || p1 === 'Component') {
    return match;
  }
  return `const ${p1} = React.lazy(() => import('${p2}'));`;
});

fs.writeFileSync('src/App.jsx', newCode);
console.log('Imports replaced successfully.');
