import React, { useSyncExternalStore } from 'react'

let currentNotify: (() => void) | null = null

let internalExecutionDepth = 0

export function runWithoutTracking<R>(fn: () => R): R {
  internalExecutionDepth++
  try {
    return fn()
  } finally {
    internalExecutionDepth--
  }
}

export class Ref<T = any> {
  readonly __isRef = true
  private _val: T
  private _notify: (() => void) | null

  constructor(val: T, notify?: () => void) {
    this._val = val
    this._notify = notify || currentNotify
  }

  get value(): T {
    return this._val
  }

  set value(v: T) {
    this._val = v
    if (this._notify) this._notify()
  }
}

export function ref<T>(val: T): Ref<T> {
  return new Ref<T>(val, currentNotify || undefined)
}

export class Computed<T = any> {
  readonly __isRef = true
  private _getter: () => T

  constructor(getter: () => T) {
    this._getter = getter
  }

  get value(): T {
    internalExecutionDepth++
    try {
      return this._getter()
    } finally {
      internalExecutionDepth--
    }
  }
}

export function computed<T>(getter: () => T): Computed<T> {
  return new Computed<T>(getter)
}

export function storeToRefs<T extends Record<string, any>>(store: T): any {
  const res: any = {}
  for (const key of Object.keys(store)) {
    if (key.startsWith('$')) continue
    Object.defineProperty(res, key, {
      enumerable: true,
      get() {
        return {
          __isRef: true,
          get value() {
            return store[key]
          },
          set value(v: any) {
            ;(store as any)[key] = v
          },
        }
      },
    })
  }
  return res
}

function createStoreProxy(target: any, notify: () => void) {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      if (prop === '__isStore') return true
      if (prop === '$raw') return obj
      const val = Reflect.get(obj, prop, receiver)
      if (val && typeof val === 'object' && val.__isRef) {
        return val.value
      }
      if (typeof val === 'function') {
        return (...args: any[]) => {
          internalExecutionDepth++
          try {
            return val.apply(obj, args)
          } finally {
            internalExecutionDepth--
          }
        }
      }
      return val
    },
    set(obj, prop, value, receiver) {
      const current = Reflect.get(obj, prop, receiver)
      if (current && typeof current === 'object' && current.__isRef) {
        current.value = value
        return true
      }
      const res = Reflect.set(obj, prop, value, receiver)
      notify()
      return res
    },
  })
}

const allStoreResets = new Set<() => void>()

export function resetAllStores() {
  allStoreResets.forEach((fn) => fn())
}

export type UnwrapStore<T> = {
  [K in keyof T]: T[K] extends Ref<infer V>
    ? V
    : T[K] extends Computed<infer V>
    ? V
    : T[K]
}

export function defineStore<T extends Record<string, any>>(
  _name: string,
  setup: () => T
): { (): UnwrapStore<T>; getState: () => UnwrapStore<T>; $reset: () => void } {
  let instance: any = null
  let version = 0
  const listeners = new Set<() => void>()

  function notify() {
    version++
    listeners.forEach((l) => l())
  }

  function subscribe(onStoreChange: () => void) {
    listeners.add(onStoreChange)
    return () => listeners.delete(onStoreChange)
  }

  function getSnapshot() {
    return version
  }

  function initStore() {
    if (!instance) {
      internalExecutionDepth++
      const prevNotify = currentNotify
      currentNotify = notify
      let raw: T
      try {
        raw = setup()
      } finally {
        currentNotify = prevNotify
        internalExecutionDepth--
      }
      instance = createStoreProxy(raw, notify)
    }
    return instance
  }

  const hook: any = function useStore() {
    const store = initStore()
    if (internalExecutionDepth === 0) {
      const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ||
        (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
      const dispatcher = internals?.H || internals?.ReactCurrentDispatcher?.current
      if (dispatcher) {
        try {
          useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
        } catch {
          // Outside React rendering context
        }
      }
    }
    return store
  }

  hook.getState = () => initStore()

  hook.$reset = () => {
    instance = null
    notify()
  }

  allStoreResets.add(hook.$reset)

  return hook
}
