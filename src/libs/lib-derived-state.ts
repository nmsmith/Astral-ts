import { reactive as observable, ReactiveEffect, computed, stop } from "@vue/reactivity"

const logDerivedState = false
function log(...args: unknown[]): void {
    if (logDerivedState) console.log(...args)
}

/* eslint-disable @typescript-eslint/no-use-before-define */

export type WithDerivedProps<T> = T & {
    /**
     * Makes the object ready for garbage collection. Call this before
     * losing the last reference to the object.
     */
    destroy: () => void
}

export type DerivedProps<Obj extends object> =
    { [K1 in keyof Obj]?: (
            // This prop can be derived
            (obj: Obj) => Obj[K1]
        ) | (
            // If this prop is an object, props of this prop can be derived
            Obj[K1] extends object
                // Exclude arrays here
                ? Obj[K1] extends object[]
                    ? never
                    : DerivedProps<Obj[K1]>
                : never
        ) | (
            // If this prop is an array, props of its elements can be derived
            Obj[K1] extends object[]
                ? DerivedProps<Obj[K1][0]>
                : never
        )
    }

type PropMaintainers = (ReactiveEffect | WithDerivedProps<unknown[]>)[]

function constructDerivedProperties<T extends object>(
    currObj: T,
    spec: DerivedProps<T>,
    maintainers: PropMaintainers,
): void {
    Object.entries(spec).forEach(([propName, propSpec]) => {
        if (typeof propSpec === "function") {
            // This is a derived property
            const c = computed(() => {
                const currentValue = (propSpec as (obj: T) => unknown)(currObj)
                log("%cObject", "font-weight: bold")
                log(`  %c${propName} =`, "color: #7700ff", currentValue)
                return currentValue
            })
            maintainers.push(c.effect)
            Object.defineProperty(currObj, propName, {
                get() {return c.value},
                set() {throw `Can't assign to the (readonly) derived property "${propName}".`},
                enumerable: false, // Prevent this property from being serialized
                configurable: true, // Allow this property to be deleted
            })
        }
        else if (typeof propSpec === "object") {
            // This is specification for derived sub-properties
            const targetObj: object = (currObj as any)[propName]
            let derivedValue: object
            if (Array.isArray(targetObj)) {
                // Wrap the existing array to make it reactive
                const arrayMaintainer: WithDerivedProps<T[]> =
                    arrayWithDerivedProps(targetObj, propSpec as DerivedProps<object>)
                maintainers.push(arrayMaintainer)
                derivedValue = arrayMaintainer
            }
            else {
                constructDerivedProperties(targetObj, propSpec as DerivedProps<object>, maintainers)
                derivedValue = targetObj
            }
            Object.defineProperty(currObj, propName, {
                get() {return derivedValue},
                set() {throw `Can't assign to "${propName}". Its current value has derived properties that can't be reconstructed.`},
                enumerable: true, // This property can be serialized
            })
        }
    })
}

function destroyMaintainedObject<T extends object>(
    obj: T,
    derivedProps: DerivedProps<T>,
    maintainers: PropMaintainers
): void {
    // Clean up effects and nested containers
    maintainers.forEach(maintainer => {
        if (Array.isArray(maintainer)) {
            // Clean up recursively
            maintainer.destroy()
        }
        else {
            stop(maintainer)
        }
    })
    // Delete the derived properties on this object so they can't be abused
    Object.keys(derivedProps).forEach(propName => {
        delete (obj as any)[propName]
    })
}

/**
 * Attaches computed properties to the object (including to sub-objects) as specified by
 * derivedProps. The last-computed values of these properties are cached and updates to
 * them are observable (via @vue/reactivity).
 * 
 * Because this function depends on @vue/reactivity it requires manual memory management
 * for effects. The user must either ensure the object lives for the entire duration of
 * the program (as a top-level const binding or readonly prop thereof), or call destroy()
 * before losing the last reference to it.
 * 
 * Computed properties can depend on each other, as long as the dependency isn't cyclic.
 */
export function withDerivedProps<Obj extends object>(
    sourceObject: Obj,
    derivedProps: DerivedProps<Obj>,
): WithDerivedProps<Obj> {
    const observableObject = observable(sourceObject) as Obj
    const maintainers: PropMaintainers = []      
    constructDerivedProperties(observableObject, derivedProps, maintainers)
    ;(observableObject as WithDerivedProps<Obj>).destroy =
        (): void => destroyMaintainedObject(observableObject, derivedProps, maintainers)
    return observableObject as WithDerivedProps<Obj>
}

/**
 * Attaches computed properties to each element in the array.
 */
function arrayWithDerivedProps<Obj extends object>(
    sourceArray: Obj[],
    derivedProps: DerivedProps<Obj>,
): WithDerivedProps<Obj[]> {
    // For each Obj in the source array, stores the number of copies of it in the array,
    // along with the maintainers for its derived properties.
    const derivedData: WeakMap<Obj, {copies: number, maintainers: PropMaintainers}> = new WeakMap()
    
    function removed(obj: Obj): void {
        if (obj === undefined) return
        const data = derivedData.get(obj)!
        if (data.copies === 1) {
            // All references to the object have been removed from the array
            derivedData.delete(obj)
            destroyMaintainedObject(obj, derivedProps, data.maintainers)
            log("Removed derived props from", obj)
        }
        else {
            data.copies -= 1
        }
    }

    // WARNING: Objects passed as arguments must be already in (and grabbed from) the array,
    // since observable() objects inserted into the array are wrapped in a Vue proxy.
    function added(obj: Obj): void {
        if (obj === undefined) return
        const data = derivedData.get(obj)
        if (data === undefined) {
            const maintainers: PropMaintainers = []      
            constructDerivedProperties(obj, derivedProps, maintainers)
            log("Added derived props to", obj)
            derivedData.set(obj, {
                copies: 1,
                maintainers,
            })
        }
        else {
            data.copies += 1
        }
    }

    // Track these initial elements
    sourceArray.forEach(added)
    // Set up a proxy to maintain the number of copies of each object in the array,
    // and remove the derived properties when the object is removed from the array.
    const proxy = new Proxy(sourceArray, {
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
                            if ((Array.prototype as any)[prop] !== undefined) {
                                // Get the original method from the prototype (if applicable),
                                // because Vue hijacks our proxied array's methods to add
                                // "instrumentation", which causes an infinite call cycle.
                                return (Array.prototype as any)[prop].apply(this, args)
                            }
                            else {
                                value.apply(this, args)
                            }
                        }
                    }
                    else {
                        return value
                    }
                    
            }
        },
    })
    
    ;(proxy as WithDerivedProps<Obj[]>).destroy = (): Obj[] => {
        sourceArray.forEach(removed)
        return sourceArray
    }
    return proxy as WithDerivedProps<Obj[]>
}