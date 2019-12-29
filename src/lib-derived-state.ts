import { reactive as observable, ReactiveEffect, computed, stop } from "@vue/reactivity"

declare global {
    interface ArrayConstructor {
        /**
         * Creates an array that automatically assigns the given set of computed properties
         * to the objects it holds. The last-computed values of these properties are cached
         * and updates to them are observable (via @vue/reactivity).
         * 
         * It is best to treat objects held in this array as OWNED by the array. If an object
         * is removed from the array, then its computed properties are deleted via a finalizer.
         * This is necessary because @vue/reactivity requires manual memory management for effects.
         * 
         * Computed properties can depend on each other, as long as the dependency isn't cyclic.
         */
        withDerivedProps: <Key extends string, Obj extends Record<Key, unknown>>(
            derivedProps: {[K in Key]: (obj: Obj) => Obj[Key]},
        ) => Obj[]
    }
}

Array.withDerivedProps = function<Key extends string, Obj extends Record<Key, unknown>>(
    derivedProps: {[K in Key]: (obj: Obj) => Obj[Key]},
): Obj[] {
    // Must put an observable Proxy around the items first, so that
    // the proxy can make its way inside the computed() lambda.
    const items: Obj[] = observable([])

    // For each Obj in the array, stores the number of copies of it in the array,
    // along with the effect handlers for maintaining its derived properties.
    const derivedData: WeakMap<Obj, {copies: number, effects: ReactiveEffect[]}> = new WeakMap()
    
    function removed(obj: Obj): void {
        if (obj === undefined) return
        console.log(obj)
        const data = derivedData.get(obj)!
        if (data.copies === 1) {
            // Clean up the object if it will no longer be in the array
            derivedData.delete(obj)
            data.effects.forEach(stop)
            Object.keys(derivedProps).map(propName => delete (obj as any)[propName])
            console.log("Removed derived props from", obj)
        }
        else {
            data.copies -= 1
        }
    }

    // WARNING: Objects passed as arguments must have been freshly grabbed out of the array,
    // since observable() objects inserted into the array are wrapped in a Vue proxy.
    function added(obj: Obj): void {
        if (obj === undefined) return
        const data = derivedData.get(obj)
        if (data === undefined) {
            derivedData.set(obj, {
                copies: 1,
                effects: Object.entries(derivedProps).map(([propName, propValue]) => {
                    const c = computed(() => {
                        console.log(`Updating derived property "${propName}"`)
                        return (propValue as (obj: Obj) => unknown)(obj)
                    })
                    ;(obj as any)[propName] = c
                    return c.effect
                }),
            })
            console.log("Added derived props to", obj)
        }
        else {
            data.copies += 1
        }
    }

    // Set up a proxy to maintain the number of copies of each object in the array,
    // and remove the derived property when the object is removed from the array.
    const proxy = new Proxy(items, {
        // Array elements are fundamentally added and removed via indexing
        set: (rawArray, prop, newValue): boolean => {
            const index = Number(prop) // returns NaN if the property is not a number
            if (index === index) { // Test if index is a number
                if (index < rawArray.length) {
                    removed(rawArray[index])
                }
                // MUST put the new value in the array before passing it to added(),
                // since this wraps the value in its Vue Proxy first.
                rawArray[index] = newValue
                added(rawArray[index])
            }
            else if (prop === "length") {
                 for (let i = newValue; i < rawArray.length; ++i) {
                     removed(rawArray[i])
                 }
                 rawArray.length = newValue
            }
            else {
                (rawArray as any)[prop] = newValue
            }
            return true
        },
        // Special-cased array functions that bypass the proxied indexing to reduce the bookkeeping
        get: (rawArray, prop): any => {
            const value = (rawArray as any)[prop]

            switch (prop) {
                case "reverse":
                    return (): Obj[] => {
                        rawArray.reverse()
                        return proxy
                    }
                case "sort":
                    return (f: (a: Obj, b: Obj) => number): Obj[] => {
                        rawArray.sort(f)
                        return proxy
                    }
                case "shift":
                    return (): Obj | undefined => {
                        const removedItem = rawArray.shift()
                        if (removedItem !== undefined) removed(removedItem)
                        return removedItem
                    }
                case "unshift":
                    return (...newItems: Obj[]): number => {
                        const result = rawArray.unshift(...newItems)
                        for (let i = 0; i < newItems.length; ++i) {
                            // MUST call added() on the items only after they have
                            // been added to the array and wrapped in the Vue proxy.
                            added(rawArray[i])
                        }
                        return result
                    }
                default:
                    // Return the proxied array's property unchanged
                    if (typeof value === "function") {
                        return function(this: Obj, ...args: unknown[]): unknown {
                            return value.apply(this, args)
                        }
                    }
                    else {
                        return value
                    }
                    
            }
        },
    })
    return proxy as Obj[]
}

export {}