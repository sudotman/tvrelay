/// <reference types="vite/client" />

import type { TvRemoteApi } from '@shared/ipc'

declare global {
  interface Window {
    tvRemoteApi: TvRemoteApi
  }
}

export {}
