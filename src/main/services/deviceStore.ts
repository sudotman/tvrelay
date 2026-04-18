import Store from 'electron-store'
import type { SavedDevice } from '@shared/types'

export interface DeviceStoreSnapshot {
  savedDevices: SavedDevice[]
  activeDeviceId: string | null
}

export interface DeviceStore {
  load(): DeviceStoreSnapshot
  save(snapshot: DeviceStoreSnapshot): void
}

export class ElectronDeviceStore implements DeviceStore {
  private readonly store = new Store<DeviceStoreSnapshot>({
    name: 'devices',
    defaults: {
      savedDevices: [],
      activeDeviceId: null
    }
  })

  load(): DeviceStoreSnapshot {
    return this.store.store
  }

  save(snapshot: DeviceStoreSnapshot): void {
    this.store.set(snapshot)
  }
}
