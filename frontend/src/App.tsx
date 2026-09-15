import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'

import { Backdrop } from '@/components/Backdrop'
import { ConfirmProvider } from '@/components/ConfirmProvider'
import { ToastProvider } from '@/components/Toast'
import { UpdatePrompt } from '@/components/UpdatePrompt'
import { AuthProvider } from '@/lib/auth/AuthContext'
import { router } from '@/routes'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <ConfirmProvider>
            {/* Mounted once, globally — mirrors old app.js's bootApp()
                calling mountBackdrop() before checking auth state, so the
                starfield background is present on the login/gate screens
                too, not just the post-login app shell. */}
            <Backdrop />
            <RouterProvider router={router} />
            <UpdatePrompt />
          </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
