import { useState, useCallback } from 'react'

export type OptimisticState = 'idle' | 'pending' | 'confirmed' | 'error' | 'conflict'

export interface OptimisticUpdateConfig<T> {
  onMutate: (previousData: T) => Promise<T>
  onSuccess?: (data: T) => void
  onError?: (error: Error, previousData: T) => void
  onConflict?: (localData: T, serverData: T) => T
}

export function useOptimisticUpdate<T>(config: OptimisticUpdateConfig<T>) {
  const [state, setState] = useState<OptimisticState>('idle')
  const [optimisticData, setOptimisticData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [conflictData, setConflictData] = useState<{ local: T; server: T } | null>(null)

  const mutate = useCallback(
    async (previousData: T, mutationFn: () => Promise<T>) => {
      setState('pending')
      setOptimisticData(previousData)
      setError(null)
      setConflictData(null)

      try {
        const serverData = await mutationFn()
        setState('confirmed')
        setOptimisticData(null)
        config.onSuccess?.(serverData)
        return { success: true, data: serverData }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        setState('error')
        config.onError?.(error, previousData)
        setError(error)
        return { success: false, error }
      }
    },
    [config]
  )

  const resolveConflict = useCallback(
    (resolution: 'local' | 'server' | 'merge', mergedData?: T) => {
      if (!conflictData) return

      const finalData =
        resolution === 'local'
          ? conflictData.local
          : resolution === 'server'
            ? conflictData.server
            : mergedData || conflictData.local

      setState('confirmed')
      setConflictData(null)
      config.onSuccess?.(finalData)
    },
    [conflictData, config]
  )

  const reset = useCallback(() => {
    setState('idle')
    setOptimisticData(null)
    setError(null)
    setConflictData(null)
  }, [])

  return {
    state,
    optimisticData,
    error,
    conflictData,
    mutate,
    resolveConflict,
    reset,
  }
}
