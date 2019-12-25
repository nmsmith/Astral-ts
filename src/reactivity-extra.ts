import { ref, Ref, isRef, ComputedRef, effect } from "@vue/reactivity"

// Reactive if-expression. Constructs a ComputedRef whose value is always equal to
// the value of the branch given by the latest value of the condition. Note that
// since the observables ("refs") that are triggered by the evaluation of condition()
// will hold a strong reference to the effect, the caller is responsible
// for destroying the effect using stop() when it is no longer needed.
// If the effect is not manually destroyed, a memory leak may occur.
// The effect is accessible via the .effect field of the ComputedRef.
export function computedIf<T>(
    condition: () => boolean,
    branches: {_then: () => T, _else: () => T},
): ComputedRef<T> {
    const _then = branches._then
    const _else = branches._else
    // We have to initialize this as undefined, but it will get
    // assigned a value immediately when the effect runs.
    const result: Ref<T | undefined> = ref(undefined)
    let conditionPrevious: boolean | undefined = undefined
    ;(result as any).effect = effect(() => {
        console.log("TRIGGERED: $if")
        const conditionNow = condition()
        if (conditionNow === true && conditionPrevious !== true) {
            result.value = _then() as any
        }
        else if (conditionNow === false && conditionPrevious !== false) {
            result.value = _else() as any
        }
        conditionPrevious = conditionNow
    })
    return (result as ComputedRef<T>)
}

// Reactive for-loop for iteratively constructing a sequence of values.
// Emulates Vue's v-for directive.
// Accepts either a reactive/observable array, or a Ref to an array.
export function computedFor<T, R>(
    items: T[] | Ref<T[]>,
    f: (item: T, index: number) => R[],
): ComputedRef<R[]> {
    // We have to initialize this as undefined, but it will get
    // assigned a value immediately when the effect runs.
    const result: Ref<R[] | undefined> = ref(undefined)
    ;(result as any).effect = isRef(items)
        ? effect(() => {
            console.log("TRIGGERED: $for")
            const array: R[] = []
            items.value.forEach((item, i) => {
                array.push(...f(item as T, i))
            })
            result.value = array
        })
        : effect(() => {
            console.log("TRIGGERED: $for")
            const array: R[] = []
            items.forEach((item, i) => {
                array.push(...f(item as T, i))
            })
            result.value = array
        })
    return (result as ComputedRef<R[]>)
}