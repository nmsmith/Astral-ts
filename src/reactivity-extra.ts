import { ref, Ref, isRef, effect } from "@vue/reactivity"

// Reactive if-expression. Constructs a Ref whose value is always equal to
// the value of the branch given by the latest value of the condition.
export function $if<T>(condition: () => boolean, branches: {$then: () => T, $else: () => T}): Ref<T> {
    const $then = branches.$then
    const $else = branches.$else
    // We have to initialize this as undefined, but it will get
    // assigned a value immediately when the effect runs.
    const result: Ref<T | undefined> = ref(undefined)
    let conditionPrevious: boolean | undefined = undefined
    effect(() => {
        const conditionNow = condition()
        if (conditionNow === true && conditionPrevious !== true) {
            result.value = $then() as any
        }
        else if (conditionNow === false && conditionPrevious !== false) {
            result.value = $else() as any
        }
        conditionPrevious = conditionNow
    })
    return (result as Ref<T>)
}

// Reactive for-loop for iteratively constructing a sequence of values.
// Emulates Vue's v-for directive.
export function $for<T, R>(items: Ref<T[]>, f: (item: T, index: number) => R[]): Ref<R[]> {
    // We have to initialize this as undefined, but it will get
    // assigned a value immediately when the effect runs.
    const result: Ref<R[] | undefined> = ref(undefined)
    effect(() => {
        const array: R[] = []
        items.value.forEach((item, i) => {
            array.push(...f(item as T, i))
        })
        result.value = array
    })
    return (result as Ref<R[]>)
}