import { Ref, isRef, isReactive, effect } from "@vue/reactivity"

const printMutations = true

function printMutation<T>(value: T): T {
    if (printMutations) {
        console.log("Reassigned value:")
        console.log(value)
    }
    return value
}

// Keep a queue of all the effects that need running.
// TODO: Associate each unique effect with some kind of key so that we don't
// run the same effect several times (i.e. diff the same subtree several times).
const domUpdates: Function[] = []

// eslint-disable-next-line prefer-const
let scheduleDOMUpdates = true

// export function pauseDOMUpdates(): void {
//     scheduleDOMUpdates = false
// }

// export function resumeDOMUpdates(): void {
//     scheduleDOMUpdates = true
// }

function scheduleEffect(node: () => void): void {
    // Create an effect that (by default) runs immediately, and registers any state that it
    // accesses as a dependency.
    // By default, the effect will be re-executed every time the value of a dependency changes.
    // If a scheduler is provided, the effect will instead invoke the scheduler whenever
    // the value of a dependency changes. The scheduler can then decide when to run the effect.
    effect(node, {scheduler: job => { if (scheduleDOMUpdates) domUpdates.push(job) }}) 
}
// Update the DOM after executing the given state update function.
// Updating the DOM synchronously prevents any race condition where (e.g.)
// the user can click a button to alter some state that no longer exists.
function withDOMUpdates(stateUpdate: Function): Function {
    return (...args: any[]): void => {
        stateUpdate(...args)
        domUpdates.forEach(f => f())
        domUpdates.length = 0
    }
}

type SubRecord<Keys extends keyof Element, Element> = { [K in Keys]: Element[K] | Ref<Element[K]> }

// Type-safe assignment to EXISTING properties of the given object.
function assign<AssKeys extends keyof T, T>(object: T, assignment: SubRecord<AssKeys, T>): void {
    // If SOME of the properties are observable (refs), then cast them to
    // their ref type and grab their actual .value
    for (const key in assignment) {
        if (isRef(assignment[key])) {
            scheduleEffect(() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                object[(key as AssKeys)] = printMutation((assignment[key] as any).value)
            })
        }
        else {
            object[(key as AssKeys)] = (assignment[key] as any)
        }
    }
}

export function element<Keys extends keyof Element, Element extends HTMLElement>(
    name: string,
    attributes: SubRecord<Keys, Element>,
): Element {
    const el = document.createElement(name) as Element
    // Ensure that DOM events trigger DOM updates after running
    for (const key in attributes) {
        if (key.startsWith("on")) {
            // Unsafe: we're presuming all keys starting with "on" have a value of function type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            attributes[key] = withDOMUpdates(attributes[key] as any) as any
        }
    }
    assign(el, attributes)
    return el
}

// TODO: Figure out how to properly move children around when the array changes.
// TODO: Create a non-reactive (static) version of each of the DOM node constructors?
function attachChildren(el: HTMLElement, children: HTMLElement[]): void {
    if (isReactive(children)) {
        scheduleEffect(() => {
            while(el.firstChild !== null) {
                el.removeChild(el.firstChild)
            }
            for (const child of children) {
                el.appendChild(child)
            }
        })
    }
    else {
        for (const child of children) {
            el.appendChild(child)
        }
    }
}

export function div<Keys extends keyof HTMLDivElement>(
    attributes: SubRecord<Keys, HTMLDivElement>,
    children: HTMLElement[],
): HTMLDivElement {
    const el = element("div", attributes)
    attachChildren(el, children)
    return el
}

export function box<Keys extends keyof HTMLDivElement>(
    attributes: SubRecord<Keys, HTMLDivElement>,
): HTMLDivElement {
    return element("div", attributes)
}

export function br<Keys extends keyof HTMLBRElement>(
    attributes: SubRecord<Keys, HTMLBRElement> = {} as any,
): HTMLBRElement {
    return element("br", attributes)
}

export function p<Keys extends keyof HTMLParagraphElement>(
    textContent: string | Ref<string>,
    attributes: SubRecord<Keys, HTMLParagraphElement> = {} as any,
): HTMLParagraphElement {
    Object.assign(attributes, {textContent: textContent})
    return element("p", attributes)
}

export function button<Keys extends keyof HTMLButtonElement>(
    textContent: string | Ref<string>,
    attributes: SubRecord<Keys, HTMLButtonElement> = {} as any,
): HTMLButtonElement {
    Object.assign(attributes, {textContent: textContent})
    return element("button", attributes)
}

type ValueChangedAttribute = {valueChanged: (newValue: string) => void}

export function input<Keys extends keyof HTMLInputElement | "valueChanged">(
    attributes: SubRecord<Keys, HTMLInputElement & ValueChangedAttribute> = {} as any,
): HTMLInputElement {
    if ((attributes as any).valueChanged === undefined) {
        return element("input", attributes)
    }
    else {
        // Add a callback for when the input value changes
        const callback = (attributes as unknown as ValueChangedAttribute).valueChanged;
        (attributes as any).oninput = function(event: Event) {
            //event.stopPropagation() // Unnecessary. Will never be caught by mistake by another input.
            callback((event.target as HTMLInputElement).value)
        }
        return element("input", attributes)
    }
}
