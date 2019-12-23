import { Ref, ref, isRef, reactive, isReactive, toRefs, computed, effect } from "@vue/reactivity"

// Keep a queue of all the effects that need running.
// TODO: Associate each unique effect with some kind of key so that we don't
// run the same effect several times (i.e. diff the same subtree several times).
const domUpdates: Function[] = []

function scheduleEffect(node: () => void): void {
    // Create an effect that (by default) runs immediately, and registers any state that it
    // accesses as a dependency.
    // By default, the effect will be re-executed every time the value of a dependency changes.
    // If a scheduler is provided, the effect will instead invoke the scheduler whenever
    // the value of a dependency changes. The scheduler can then decide when to run the effect.
    effect(node, {scheduler: job => domUpdates.push(job)}) 
}
// Update the DOM after executing the given state update function.
// Updating the DOM synchronously prevents any race condition where (e.g.)
// the user can click a button to alter some state that no longer exists.
function withDOMUpdates(stateUpdate: () => void): () => void {
    return (): void => {
        stateUpdate()
        domUpdates.forEach(f => f())
        domUpdates.length = 0
    }
}

type TextContent = string | number | Ref<string | number>

// Type-safe assignment to EXISTING properties of the given object.
function assign<T, AssKeys extends keyof T>(object: T, assignment: Record<AssKeys, T[AssKeys]>): void {
    // If the set of properties is observable ("reactive"), then schedule their
    // reassignment (DOM update) every time they change.
    if (isReactive(assignment)) {
        for (const key in assignment) {
            scheduleEffect(() => {
                let value = assignment[key]
                if (isRef(value)) {
                    console.log("found ref")
                    value = value.value
                }
                object[(key as AssKeys)] = assignment[key]
                console.log(`Reassigned value: ${assignment[key]}`)
            })
        }
    }
    // If SOME of the properties are observable (refs), then cast them to
    // their ref type and grab their actual .value
    else {
        for (const key in assignment) {
            if (isRef(assignment[key])) {
                scheduleEffect(() => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    object[(key as AssKeys)] = (assignment[key] as any).value
                })
            }
            else {
                object[(key as AssKeys)] = assignment[key]
            }
        }
    }
}

type SubRecord<Element, Keys extends keyof Element> = Record<Keys, Element[Keys]>

export function element<Element extends HTMLElement, Keys extends keyof Element>(
    name: string,
    attributes: SubRecord<Element, Keys>,
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
function attachChildren(el: HTMLElement, children: Ref<HTMLElement[]>): void {
    scheduleEffect(() => {
        while(el.firstChild !== null) {
            el.removeChild(el.firstChild)
        }
        for (const child of children.value) {
            el.appendChild(child as HTMLElement)
        }
    })
}

export function div<Keys extends keyof HTMLDivElement>(
    attributes: SubRecord<HTMLDivElement, Keys>,
    children: Ref<HTMLElement[]>,
): HTMLDivElement {
    const el = element("div", attributes)
    attachChildren(el, children)
    return el
}

export function p<Keys extends keyof HTMLParagraphElement>(
    attributes: SubRecord<HTMLParagraphElement, Keys>,
    //textContent: Ref<string>,
): HTMLParagraphElement {
    return element("p", attributes)
}

export function button<Keys extends keyof HTMLButtonElement>(
    attributes: SubRecord<HTMLButtonElement, Keys>,
    //textContent: Ref<HTMLElement[]>,
): HTMLButtonElement {
    return element("button", attributes)
}

// export function link(attributes: ElementAttributes, address: string, text: TextContent) {
//     return leafElement("p", {...attributes, href: address})
// }

// export function br(): HTMLElement {
//     return document.createElement("br")
// }

// export function button(attributes: ElementAttributes, label: TextContent): HTMLElement {
//     return leafElement("button", attributes, label)
// }



// function elementWithAttributes(elementName: string, attributes: Attri): HTMLElement {
//     const el = document.createElement(elementName) as HTMLLinkElement
//     Object.assign(el, {foo: 3})
//     if (attributes.onClick !== undefined) el.onclick = withDOMUpdates(attributes.onClick)
//     return el
// }

// function attachTextContent(el: HTMLElement, textContent: TextContent) {
//     switch (typeof text) {
//         case "string":
//         case "number":
//             el.textContent = text.toString()
//             break
//         default:
//             scheduleEffect(() => el.textContent = text.value.toString())
//     }
// }
