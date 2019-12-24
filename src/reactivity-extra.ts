import { ref, Ref, isRef, effect } from "@vue/reactivity"

// Reactive if-expression. Constructs a Ref whose value is always equal to
// the value of the branch given by the latest value of the condition.
export function $if<T>(condition: () => boolean, branches: {$then: T | Ref<T>, $else: T | Ref<T>}): Ref<T> {
    const $then = branches.$then
    const $else = branches.$else
    // We have to initialize this as null, but it will get
    // assigned a value immediately then the effect runs.
    const result: Ref<null | T> = ref(null)
    effect(() => {
        if (condition()) {
            console.log("pre")
            const newValue = (isRef($then) ? $then.value : $then) as any
            if (result.value !== newValue) {
                result.value = newValue
                console.log(newValue)
            }
            console.log("post")
        }
        else {
            result.value = (isRef($else) ? $else.value : $else) as any
        }
    })
    return (result as Ref<T>)
}

// Reactive for-loop for iteratively constructing a sequence of values.
// Emulates Vue's v-for directive.
export function $for<T, R>(items: Ref<T[]>, f: (item: T, index: number) => R[]): Ref<R[]> {
    // We have to initialize this as null, but it will get
    // assigned a value immediately then the effect runs.
    const result: Ref<null | R[]> = ref(null)
    effect(() => {
        const array: R[] = []
        items.value.forEach((item, i) => {
            array.push(...f(item as T, i))
        })
        result.value = array
    })
    return (result as Ref<R[]>)
}