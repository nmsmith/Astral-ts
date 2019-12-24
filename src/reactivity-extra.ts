import { computed, readonly } from "@vue/reactivity"

// This is a hack for derived DOM ATTRIBUTES only.
// This function allows a Ref to masquerade as a normal value so that it typechecks
// for the HTML API. The view library will re-identify it as a Ref later.
export function derived<T>(obj: () => T): T {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return computed(obj) as any
}

// Turn an object into a reactive version that always stays up to date.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function allDerived<T extends Record<keyof T, () => any>>(obj: T):
    Readonly<{ [P in keyof T]: ReturnType<T[P]> }> {
    return readonly(Object.assign({}, ...Object.entries<() => T[keyof T]>(obj).map(([k, v]) => {
        return {[k]: computed(v)}
    })))
}