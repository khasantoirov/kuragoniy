import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'

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
            <RouterProvider router={router} />
            <UpdatePrompt />
          </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
