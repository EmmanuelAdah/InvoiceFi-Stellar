'use client'

import { ReactNode } from 'react'

export interface ConflictData {
  local: Record<string, any>
  server: Record<string, any>
}

interface Props {
  conflict: ConflictData
  onResolve: (resolution: 'local' | 'server' | 'merge') => void
  title?: string
  description?: string
}

export function ConflictResolution({
  conflict,
  onResolve,
  title = 'Data Conflict Detected',
  description = 'Your local changes conflict with the latest server data. Choose how to resolve this.',
}: Props) {
  return (
    <div className="conflict-modal" role="dialog" aria-labelledby="conflict-title">
      <div className="conflict-content">
        <h2 id="conflict-title">{title}</h2>
        <p>{description}</p>

        <div className="conflict-comparison">
          <div className="conflict-column">
            <h3>Your Changes (Local)</h3>
            <div className="conflict-data">
              <pre>{JSON.stringify(conflict.local, null, 2)}</pre>
            </div>
          </div>

          <div className="conflict-column">
            <h3>Latest Data (Server)</h3>
            <div className="conflict-data">
              <pre>{JSON.stringify(conflict.server, null, 2)}</pre>
            </div>
          </div>
        </div>

        <div className="conflict-actions">
          <button
            className="conflict-btn conflict-btn-local"
            onClick={() => onResolve('local')}
            aria-label="Keep your local changes"
          >
            Keep My Changes
          </button>
          <button
            className="conflict-btn conflict-btn-server"
            onClick={() => onResolve('server')}
            aria-label="Use latest server data"
          >
            Use Latest Data
          </button>
          <button
            className="conflict-btn conflict-btn-merge"
            onClick={() => onResolve('merge')}
            aria-label="Merge both changes"
          >
            Merge Changes
          </button>
        </div>

        <p className="conflict-note">
          Note: This conflict was detected after reconnecting. No data has been lost, and you can review both versions above.
        </p>
      </div>
    </div>
  )
}
