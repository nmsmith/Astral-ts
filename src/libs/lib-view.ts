import { Ref, isRef, effect, ReactiveEffect, stop , pauseTracking, resetTracking} from "@vue/reactivity"

// Styles for debug printing
const updateMsgStyle = "font-size: 110%; font-weight: bold; color: blue; padding-top: 12px"
const elementStyle = "font-weight: bold"
const attributeChangedStyle = "color: #7700ff"
const textContentStyle = "color: #007700"

// For some reason HTML has width and height attributes: we need
// to nuke them so we can re-use them for CSS styling.
type Styleless<T> = Omit<Omit<T, "width">, "height">
type StylelessElement = Styleless<HTMLElement>

type EventHandler =
    | "oncut"
    | "onend"
    | "onLine"
    | "onblur"
    | "oncopy"
    | "ondrag"
    | "ondrop"
    | "onexit"
    | "onload"
    | "onmark"
    | "onmute"
    | "onopen"
    | "onplay"
    | "onshow"
    | "onzoom"
    | "onabort"
    | "onclick"
    | "onclose"
    | "onended"
    | "onenter"
    | "onerror"
    | "onfocus"
    | "oninput"
    | "onkeyup"
    | "onpaste"
    | "onpause"
    | "onreset"
    | "onstart"
    | "ontrack"
    | "onwheel"
    | "onbounce"
    | "oncached"
    | "oncancel"
    | "onchange"
    | "onfinish"
    | "ononline"
    | "onresize"
    | "onresult"
    | "onresume"
    | "onscroll"
    | "onseeked"
    | "onselect"
    | "onsubmit"
    | "ontoggle"
    | "onunload"
    | "onunmute"
    | "onupdate"
    | "onblocked"
    | "oncanplay"
    | "ondragend"
    | "onemptied"
    | "oninvalid"
    | "onkeydown"
    | "onloadend"
    | "onmessage"
    | "onmouseup"
    | "onnomatch"
    | "onoffline"
    | "onplaying"
    | "onseeking"
    | "onstalled"
    | "onstorage"
    | "onsuccess"
    | "onsuspend"
    | "ontimeout"
    | "onwaiting"
    | "onaddtrack"
    | "onaudioend"
    | "onauxclick"
    | "onboundary"
    | "onchecking"
    | "oncomplete"
    | "ondblclick"
    | "ondragexit"
    | "ondragover"
    | "onkeypress"
    | "onmouseout"
    | "onnoupdate"
    | "onobsolete"
    | "onpagehide"
    | "onpageshow"
    | "onpopstate"
    | "onprogress"
    | "onsoundend"
    | "ontouchend"
    | "oncuechange"
    | "ondragenter"
    | "ondragleave"
    | "ondragstart"
    | "onencrypted"
    | "onloadstart"
    | "onmousedown"
    | "onmousemove"
    | "onmouseover"
    | "onmsneedkey"
    | "onpointerup"
    | "onspeechend"
    | "ontouchmove"
    | "onupdateend"
    | "onafterprint"
    | "onaudiostart"
    | "onhashchange"
    | "onloadeddata"
    | "onmouseenter"
    | "onmouseleave"
    | "onmousewheel"
    | "onpointerout"
    | "onratechange"
    | "onsoundstart"
    | "onsourceopen"
    | "onstatsended"
    | "ontimeupdate"
    | "ontonechange"
    | "ontouchstart"
    | "onbeforeprint"
    | "oncontextmenu"
    | "ondatachannel"
    | "ondevicelight"
    | "ondownloading"
    | "onmspointerup"
    | "onpointerdown"
    | "onpointermove"
    | "onpointerover"
    | "onremovetrack"
    | "onselectstart"
    | "onsourceclose"
    | "onsourceended"
    | "onspeechstart"
    | "onstatechange"
    | "ontouchcancel"
    | "onupdatefound"
    | "onupdateready"
    | "onupdatestart"
    | "onanimationend"
    | "onaudioprocess"
    | "onbeforeunload"
    | "ondevicechange"
    | "ondevicemotion"
    | "onicecandidate"
    | "onmessageerror"
    | "onmsgestureend"
    | "onmsgesturetap"
    | "onmspointerout"
    | "onpointerenter"
    | "onpointerleave"
    | "onvolumechange"
    | "one-dimensional"
    | "onmsgesturehold"
    | "onmspointerdown"
    | "onmspointermove"
    | "onmspointerover"
    | "onpointercancel"
    | "ontransitionend"
    | "ontransitionrun"
    | "onupgradeneeded"
    | "onversionchange"
    | "onvoiceschanged"
    | "onvrdisplayblur"
    | "onwaitingforkey"
    | "onanimationstart"
    | "oncanplaythrough"
    | "ondurationchange"
    | "onlanguagechange"
    | "onloadedmetadata"
    | "onlocalcandidate"
    | "onmsgesturestart"
    | "onmsinertiastart"
    | "onmspointerenter"
    | "onmspointerleave"
    | "onprocessorerror"
    | "onvrdisplayfocus"
    | "onaddsourcebuffer"
    | "onanimationcancel"
    | "onfullscreenerror"
    | "onisolationchange"
    | "onmsgesturechange"
    | "onmspointercancel"
    | "onselectionchange"
    | "ontransitionstart"
    | "oncontrollerchange"
    | "onfullscreenchange"
    | "onpointerlockerror"
    | "onreadystatechange"
    | "onrejectionhandled"
    | "ontransitioncancel"
    | "onvisibilitychange"
    | "onvrdisplayconnect"
    | "onbufferedamountlow"
    | "ondeviceorientation"
    | "ongotpointercapture"
    | "onicecandidateerror"
    | "onkeystatuseschange"
    | "onnegotiationneeded"
    | "onorientationchange"
    | "onpointerlockchange"
    | "onvrdisplayactivate"
    | "onanimationiteration"
    | "onlostpointercapture"
    | "onmsgesturedoubletap"
    | "onremovesourcebuffer"
    | "onunhandledrejection"
    | "oncandidatewindowhide"
    | "oncandidatewindowshow"
    | "onvrdisplaydeactivate"
    | "onvrdisplaydisconnect"
    | "onMSVideoFormatChanged"
    | "ongatheringstatechange"
    | "onshippingoptionchange"
    | "onsignalingstatechange"
    | "oncandidatewindowupdate"
    | "onconnectionstatechange"
    | "onshippingaddresschange"
    | "onvrdisplaypresentchange"
    | "oncompassneedscalibration"
    | "onicegatheringstatechange"
    | "onsecuritypolicyviolation"
    | "oniceconnectionstatechange"
    | "onresourcetimingbufferfull"
    | "onMSVideoFrameStepCompleted"
    | "ondeviceorientationabsolute"
    | "onvrdisplaypointerrestricted"
    | "onMSVideoOptimalLayoutChanged"
    | "onselectedcandidatepairchange"
    | "onvrdisplaypointerunrestricted"

const eventHandlerNames = new Set([
    "oncut",
    "onend",
    "onLine",
    "onblur",
    "oncopy",
    "ondrag",
    "ondrop",
    "onexit",
    "onload",
    "onmark",
    "onmute",
    "onopen",
    "onplay",
    "onshow",
    "onzoom",
    "onabort",
    "onclick",
    "onclose",
    "onended",
    "onenter",
    "onerror",
    "onfocus",
    "oninput",
    "onkeyup",
    "onpaste",
    "onpause",
    "onreset",
    "onstart",
    "ontrack",
    "onwheel",
    "onbounce",
    "oncached",
    "oncancel",
    "onchange",
    "onfinish",
    "ononline",
    "onresize",
    "onresult",
    "onresume",
    "onscroll",
    "onseeked",
    "onselect",
    "onsubmit",
    "ontoggle",
    "onunload",
    "onunmute",
    "onupdate",
    "onblocked",
    "oncanplay",
    "ondragend",
    "onemptied",
    "oninvalid",
    "onkeydown",
    "onloadend",
    "onmessage",
    "onmouseup",
    "onnomatch",
    "onoffline",
    "onplaying",
    "onseeking",
    "onstalled",
    "onstorage",
    "onsuccess",
    "onsuspend",
    "ontimeout",
    "onwaiting",
    "onaddtrack",
    "onaudioend",
    "onauxclick",
    "onboundary",
    "onchecking",
    "oncomplete",
    "ondblclick",
    "ondragexit",
    "ondragover",
    "onkeypress",
    "onmouseout",
    "onnoupdate",
    "onobsolete",
    "onpagehide",
    "onpageshow",
    "onpopstate",
    "onprogress",
    "onsoundend",
    "ontouchend",
    "oncuechange",
    "ondragenter",
    "ondragleave",
    "ondragstart",
    "onencrypted",
    "onloadstart",
    "onmousedown",
    "onmousemove",
    "onmouseover",
    "onmsneedkey",
    "onpointerup",
    "onspeechend",
    "ontouchmove",
    "onupdateend",
    "onafterprint",
    "onaudiostart",
    "onhashchange",
    "onloadeddata",
    "onmouseenter",
    "onmouseleave",
    "onmousewheel",
    "onpointerout",
    "onratechange",
    "onsoundstart",
    "onsourceopen",
    "onstatsended",
    "ontimeupdate",
    "ontonechange",
    "ontouchstart",
    "onbeforeprint",
    "oncontextmenu",
    "ondatachannel",
    "ondevicelight",
    "ondownloading",
    "onmspointerup",
    "onpointerdown",
    "onpointermove",
    "onpointerover",
    "onremovetrack",
    "onselectstart",
    "onsourceclose",
    "onsourceended",
    "onspeechstart",
    "onstatechange",
    "ontouchcancel",
    "onupdatefound",
    "onupdateready",
    "onupdatestart",
    "onanimationend",
    "onaudioprocess",
    "onbeforeunload",
    "ondevicechange",
    "ondevicemotion",
    "onicecandidate",
    "onmessageerror",
    "onmsgestureend",
    "onmsgesturetap",
    "onmspointerout",
    "onpointerenter",
    "onpointerleave",
    "onvolumechange",
    "one-dimensional",
    "onmsgesturehold",
    "onmspointerdown",
    "onmspointermove",
    "onmspointerover",
    "onpointercancel",
    "ontransitionend",
    "ontransitionrun",
    "onupgradeneeded",
    "onversionchange",
    "onvoiceschanged",
    "onvrdisplayblur",
    "onwaitingforkey",
    "onanimationstart",
    "oncanplaythrough",
    "ondurationchange",
    "onlanguagechange",
    "onloadedmetadata",
    "onlocalcandidate",
    "onmsgesturestart",
    "onmsinertiastart",
    "onmspointerenter",
    "onmspointerleave",
    "onprocessorerror",
    "onvrdisplayfocus",
    "onaddsourcebuffer",
    "onanimationcancel",
    "onfullscreenerror",
    "onisolationchange",
    "onmsgesturechange",
    "onmspointercancel",
    "onselectionchange",
    "ontransitionstart",
    "oncontrollerchange",
    "onfullscreenchange",
    "onpointerlockerror",
    "onreadystatechange",
    "onrejectionhandled",
    "ontransitioncancel",
    "onvisibilitychange",
    "onvrdisplayconnect",
    "onbufferedamountlow",
    "ondeviceorientation",
    "ongotpointercapture",
    "onicecandidateerror",
    "onkeystatuseschange",
    "onnegotiationneeded",
    "onorientationchange",
    "onpointerlockchange",
    "onvrdisplayactivate",
    "onanimationiteration",
    "onlostpointercapture",
    "onmsgesturedoubletap",
    "onremovesourcebuffer",
    "onunhandledrejection",
    "oncandidatewindowhide",
    "oncandidatewindowshow",
    "onvrdisplaydeactivate",
    "onvrdisplaydisconnect",
    "onMSVideoFormatChanged",
    "ongatheringstatechange",
    "onshippingoptionchange",
    "onsignalingstatechange",
    "oncandidatewindowupdate",
    "onconnectionstatechange",
    "onshippingaddresschange",
    "onvrdisplaypresentchange",
    "oncompassneedscalibration",
    "onicegatheringstatechange",
    "onsecuritypolicyviolation",
    "oniceconnectionstatechange",
    "onresourcetimingbufferfull",
    "onMSVideoFrameStepCompleted",
    "ondeviceorientationabsolute",
    "onvrdisplaypointerrestricted",
    "onMSVideoOptimalLayoutChanged",
    "onselectedcandidatepairchange",
    "onvrdisplaypointerunrestricted",
])

let appStateForDebugPrint: unknown

/// Find the node with the given ID and replace it with the app's HTML.
/// Also organises clean-up code.
export function app<State>(rootNodeID: string, stateForDebugPrint: State | undefined, appHTML: StylelessElement): void {
    appStateForDebugPrint = stateForDebugPrint
    const rootNode = document.getElementById(rootNodeID) 
    if (rootNode === null) {
        console.error(`Unable to find app root node with ID: ${rootNodeID}`)
    }
    else {
        rootNode.replaceWith(appHTML)
    }
}

// The domUpdateJobs Map associates HTML Elements with the effects that need to run
// to keep them updated.
//
// ECMA Maps are iterated according to insertion order, and have sublinear insert time.
// We insert HTML Elements into the Map in the order that they are created, as this offers
// an optimal update order (top-down). Nodes that are part of a derived doc fragment are
// ALWAYS created after the parent they will attach to. Elements MUST be removed from
// this map when they are deleted to avoid a memory leak. A WeakMap cannot be used since
// it does not support iteration.
const domUpdateJobs: Map<StylelessElement, Set<ReactiveEffect>> = new Map()
console.log("Watch this for memory leaks: ", domUpdateJobs)

type Effectful<E> = E & {
    // Effects that need to be disabled
    $effects: ReactiveEffect[]
}

function scheduleDOMUpdate(el: Effectful<StylelessElement>, update: () => void): void {
    el.$effects.push(effect(update, {scheduler: eff => {
        const jobsForThisEl = domUpdateJobs.get(el)
        if (jobsForThisEl === undefined) {
            console.error("Job map entry missing for HTML element: ", el)
        }
        else {
            jobsForThisEl.add(eff as ReactiveEffect)
        }
    }}))
}

interface DerivedFromChoice<T> {
    condition: () => boolean
    branches: {$then: () => T, $else: () => T}
}

export type WithIndex<T extends object> = T & {$index: number}

interface DerivedFromSequence<T, I extends object> {
    type: "fromSequence"
    items: () => readonly I[] | IterableIterator<I>
    f: (item: WithIndex<I>) => T
}

interface DerivedFromSet<T, I> {
    type: "fromSet"
    items: () => Set<I>
    f: (item: I) => T
}

export type DerivedAttribute<T> = (() => T) | DerivedFromChoice<T>

export type DerivedDocFragment =
      DerivedFromChoice<StylelessElement[]>
    | DerivedFromSequence<StylelessElement[], any>
    | DerivedFromSet<StylelessElement[], any>

function isFunction(value: unknown): value is Function {
    return typeof value === "function"
}

function isDerivedFromChoice(value: unknown): value is DerivedFromChoice<unknown> {
    return (value as DerivedFromChoice<unknown>).condition !== undefined
}

function isDerivedFromSequence(value: unknown): value is DerivedFromSequence<unknown, any> {
    return (value as DerivedFromSequence<unknown, any>).type === "fromSequence"
}

function isDerivedFromSet(value: unknown): value is DerivedFromSet<unknown, any> {
    return (value as DerivedFromSet<unknown, any>).type === "fromSet"
}

/**
 * Conditionally render one of two DOM node sequences.
 */
export function $if<T>(
    condition: () => boolean,
    branches: {$then: () => T, $else: () => T},
): DerivedFromChoice<T> {
    return {condition: condition, branches: branches}
}

/**
 * Map a sequence of values to a sequence of DOM node sequences.
 * WARNING: The elements of the input sequence MUST be unique object references.
 * The DOM update code hashes the elements by their identity in order to
 * determine which elements have changed when the sequence is updated.
 * This makes DOM updates more efficient. If you need to pass a sequence
 * of primitive value as input, you can use the 
 */
export function $for<I extends object>(
    items: () => readonly I[] | IterableIterator<I>,
    f: (item: WithIndex<I>) => StylelessElement[],
): DerivedFromSequence<StylelessElement[], I> {
    return {type: "fromSequence", items: items, f: f}
}

/**
 * A helper function to turn a sequence of primitive values (e.g. ints, strings)
 * into a sequence of objects, so that they can be consumed by $for.
 */
export function makeObjSeq<I>(valueSeq: I[] | IterableIterator<I>): {value: I}[] {
    const result = []
    for (const value of valueSeq) {
        result.push({value})
    }
    return result
}

/**
 * $set is for specifying a set of DOM nodes where their insertion order does not
 * affect the visual outcome (e.g. because the nodes have position: absolute).
 * This function has an optimization over $for: items are never removed from
 * the DOM during an update, unless they have been removed from the input Set.
 * This means elements will never be blurred() accidentally, and their position
 * can be animated using CSS animations.
 */
export function $set<I>(
    items: () => Set<I>,
    f: (item: I) => StylelessElement[],
): DerivedFromSet<StylelessElement[], I> {
    return {type: "fromSet", items: items, f: f}
}

// Every node that is permanently removed from the DOM must be cleaned up via this function
function cleanUp(node: Effectful<StylelessElement>): void {
    // Double check this HTML element is one that we need to clean up
    if (node.$effects === undefined) return

    // If the node is reactive, clean it up
    if (node.$effects.length > 0) {
        domUpdateJobs.delete(node)
        node.$effects.forEach(stop)
    }

    // Clean up all children currently attached
    Array.from(node.children).forEach(node => cleanUp(node as any))
}

// Update the DOM after executing the given state update function.
let updateNumber = 0
let midUpdate = false
export function defineDOMUpdate(stateUpdate: Function): Function {
    return (...args: unknown[]): void => {
        const event = args[0] as Event
        console.log(`%cDOM update ${++updateNumber}`, updateMsgStyle)
        console.log("Event:", event.type)
        console.log("Target:", event.target)
        console.log("Current state:", appStateForDebugPrint)
        if (midUpdate) {
            console.error("WARNING: Something has triggered a nested DOM update (such as the browser engine calling onblur() during child management). The nested update call will be nullified.")
            return
        }
        else {
            midUpdate = true
        }
        // Update the essential state
        stateUpdate(...args)
        // Update the DOM
        domUpdateJobs.forEach(jobSet => {
            jobSet.forEach(eff => {
                if (eff.active) eff()
            })
            jobSet.clear()
        })
        midUpdate = false
    }
}

// Define some extra attributes for library-specific features
declare global {
    interface Element {
        "class": string // Defined just for brevity
        "data-1": any // Substitute for the "data-" attributes of HTML
        // CSS properties that can be made dynamic.
        // These property names must also be put into the "cssProperties" set.
        "left": string
        "right": string
        "top": string
        "bottom": string
        "width": string
        "height": string
        "flex-grow": string
        "flex-shrink": string
        "visibility": string
        "z-index": number
        "background-color": string
    }
}

const cssProperties = new Set([
    "left",
    "right",
    "top",
    "bottom",
    "width",
    "height",
    "flex-grow",
    "flex-shrink",
    "visibility",
    "z-index",
    "background-color",
])

// Defines a record of properties that can be assigned to an Element. If the property
// is an EventHandler, then it must be a plain old function. Otherwise, the property
// can be dynamically computed. If the property is something that can be made a
// two-way binding, (e.g. "value"), then if it is dynamic, it must be a Ref.
export type AttributeSpec<Keys extends keyof El, El extends Styleless<Element>> =
    { [K in Keys]: K extends EventHandler
        ? El[K]
        : K extends "value"
            ? (El[K] | Ref<El[K]>)
            : (El[K] | DerivedAttribute<El[K]>)
    }

function prettifyClassName(name: string): string {
    if (name.length > 0) {
        return "." + name.replace(" ",".")
    }
    else {
        return name
    }
}

function logChangeStart(el: StylelessElement): void {
    console.log(`%c${el.nodeName}${prettifyClassName(el.className)}`, elementStyle)
}

// Assign attribute values and attach listeners to re-assign observable values when they change
function assignReactiveAttributes<AssKeys extends keyof El, El extends StylelessElement>(
    el: Effectful<El>,
    assignment: AttributeSpec<AssKeys, El>,
): Effectful<El> {
    function assignKeyValue(key: string, value: unknown): void {
        if (cssProperties.has(key)) {
            el.style[key as any] = value as string
        }
        else {
            el[(key as AssKeys)] = value as any
        }
    }
    function logAttributeChange(key: string, value: unknown): void {
        logChangeStart(el)
        console.log(`  %c${key} = "${value}"`, attributeChangedStyle)
    }
    for (let key in assignment) {
        const attrValue: unknown | Ref<unknown> | DerivedAttribute<unknown> = assignment[key]
        // We hacked a "class" attribute onto Elements; now we need to fix it
        if (key === "class") {
            key = "className" as Extract<AssKeys, string>
        }

        if (isRef(attrValue)) {
            scheduleDOMUpdate(el, () => {
                assignKeyValue(key, attrValue.value)
                logAttributeChange(key, attrValue.value)
            })
        }
        else if (!eventHandlerNames.has(key) && isFunction(attrValue)) { // is derived value
            scheduleDOMUpdate(el, () => {
                const newValue = attrValue()
                assignKeyValue(key, newValue)
                logAttributeChange(key, newValue)
            })
        }
        else if (isDerivedFromChoice(attrValue)) {
            const condition = attrValue.condition
            const $then = attrValue.branches.$then
            const $else = attrValue.branches.$else
            let conditionPrevious: boolean | undefined = undefined
            
            scheduleDOMUpdate(el, () => {
                const conditionNow = condition()
                if (conditionNow === true && conditionPrevious !== true) {
                    const newValue = $then()
                    assignKeyValue(key, newValue)
                    logAttributeChange(key, newValue)
                }
                else if (conditionNow === false && conditionPrevious !== false) {
                    const newValue = $else()
                    assignKeyValue(key, newValue)
                    logAttributeChange(key, newValue)
                }

                conditionPrevious = conditionNow
            })
        }
        else {
            assignKeyValue(key, attrValue)
        }
    }
    return el
}

export type HTMLChildren =
    (StylelessElement | DerivedDocFragment)[]

function attachChildren(el: Effectful<StylelessElement>, children: HTMLChildren): void {
    function putFragmentMarker(): Element {
        // Create a marker child so that when the $if or $for fragment
        // is updated, we know where we need to insert the new elements.
        const markerChild = document.createElement("div")
        markerChild.title = "group marker"
        markerChild.hidden = true
        el.appendChild(markerChild)
        return markerChild
    }
    function logAdd(child: Effectful<StylelessElement>): void {
        console.log(`  %c+ ${child.nodeName}${prettifyClassName(child.className)} %c${child.children.length === 0 ? child.textContent : ""}`, elementStyle, textContentStyle)
    }
    function logRemove(child: Effectful<StylelessElement>): void {
        console.log(`  %c- ${child.nodeName}${prettifyClassName(child.className)} %c${child.children.length === 0 ? child.textContent : ""}`, elementStyle, textContentStyle)
    }
    function remove(child: Effectful<StylelessElement>): void {
        pauseTracking()
        el.removeChild(child)
        resetTracking()
        cleanUp(child)
        logRemove(child)
    }

    children.forEach(child => {
        if (isDerivedFromChoice(child)) {
            const marker = putFragmentMarker()
            let childrenAttachedHere: Effectful<StylelessElement>[] = []

            const condition = child.condition
            const $then = child.branches.$then
            const $else = child.branches.$else
            let conditionPrevious: boolean | undefined = undefined
        
            scheduleDOMUpdate(el, () => {  
                const conditionNow = condition()
                if (conditionNow === true && conditionPrevious !== true) {
                    // remove
                    if (childrenAttachedHere.length > 0) logChangeStart(el)
                    childrenAttachedHere.forEach(remove)
                    // add
                    childrenAttachedHere = $then() as Effectful<StylelessElement>[]
                    if (childrenAttachedHere.length > 0) logChangeStart(el)
                    childrenAttachedHere.forEach(child => {
                        pauseTracking()
                        el.insertBefore(child, marker)
                        resetTracking()
                        logAdd(child)
                    })
                }
                else if (conditionNow === false && conditionPrevious !== false) {
                    // remove
                    if (childrenAttachedHere.length > 0) logChangeStart(el)
                    childrenAttachedHere.forEach(remove)
                    // add
                    childrenAttachedHere = $else() as Effectful<StylelessElement>[]
                    if (childrenAttachedHere.length > 0) logChangeStart(el)
                    childrenAttachedHere.forEach(child => {
                        pauseTracking()
                        el.insertBefore(child, marker)
                        resetTracking()
                        logAdd(child)
                    })
                }
                conditionPrevious = conditionNow
            })
        }
        else if (isDerivedFromSequence(child)) {
            const marker = putFragmentMarker()
            let elementsCache: Map<unknown, Effectful<StylelessElement>[]> = new Map()

            const items = (child as DerivedFromSequence<Effectful<StylelessElement>[], object>).items
            const f = (child as DerivedFromSequence<Effectful<StylelessElement>[], object>).f

            scheduleDOMUpdate(el, () => {
                const fragment = document.createDocumentFragment()
                // Keep track of whether something changed. Something should ALWAYS change during a run.
                // If this is our first run (or we have no children), consider this to be a change.
                let somethingChanged = elementsCache.size === 0
                const newElementsCache: Map<unknown, Effectful<StylelessElement>[]> = new Map()
                const newElementsForLogging: Effectful<StylelessElement>[] = []
                // For each item, determine whether new or already existed
                let index = 0
                for (const item of items()) {
                    const existingElements = elementsCache.get(item)
                    if (existingElements === undefined) {
                        somethingChanged = true
                        // Associate the item with a reactive index (it may be moved later)
                        const itemWithIndex = item as WithIndex<object>
                        itemWithIndex.$index = index
                        // Item is new; create and cache its DOM elements
                        const newElements = f(itemWithIndex)
                        pauseTracking()
                        fragment.append(...newElements)
                        resetTracking()
                        newElementsCache.set(item, newElements)
                        newElementsForLogging.push(...newElements)
                    }
                    else { // Item is old; use its existing elements
                        // Update the item's index
                        if ((item as WithIndex<object>).$index !== index) {
                            (item as WithIndex<object>).$index = index
                            somethingChanged = true
                        }
                        // Need to pause tracking since moving elements can
                        // cause onBlur() to be called.
                        pauseTracking()
                        fragment.append(...existingElements)
                        resetTracking()
                        // Put the item in the new cache
                        elementsCache.delete(item)
                        newElementsCache.set(item, existingElements)
                    }
                    ++index
                }

                // Log each new item that was added
                if (newElementsForLogging.length > 0) {
                    logChangeStart(el)
                    newElementsForLogging.forEach(logAdd)
                }

                // Remove the elements for the items which were removed
                if (elementsCache.size > 0) {
                    somethingChanged = true
                    logChangeStart(el)
                    elementsCache.forEach(oldElements => {
                        oldElements.forEach(remove)
                    })
                }
                
                if (!somethingChanged) {
                    console.log(items())
                    console.error("WARNING: the following element had a child update triggered, but the children didn't need to be updated:", el)
                    console.error("This element is erroneously reacting to a change in a piece of state that was accessed in the $for body.")
                }

                // Attach the new nodes
                pauseTracking()
                el.insertBefore(fragment, marker)
                resetTracking()
                elementsCache = newElementsCache
            })
        }
        else if (isDerivedFromSet(child)) {
            const marker = putFragmentMarker()
            let elementsCache: Map<unknown, Effectful<StylelessElement>[]> = new Map()

            const items = (child as DerivedFromSet<Effectful<StylelessElement>[], any>).items
            const f = (child as DerivedFromSet<Effectful<StylelessElement>[], any>).f

            scheduleDOMUpdate(el, () => {
                const fragment = document.createDocumentFragment()
                // Keep track of whether something changed. Something should ALWAYS change during a run.
                // If this is our first run (or we have no children), consider this to be a change.
                let somethingChanged = elementsCache.size === 0
                const newElementsCache: Map<unknown, Effectful<StylelessElement>[]> = new Map()
                const newElementsForLogging: Effectful<StylelessElement>[] = []
                // For each item, determine whether new or already existed
                items().forEach(key => {
                    const existingElements = elementsCache.get(key)
                    if (existingElements === undefined) {
                        somethingChanged = true
                        // Item is new; create and cache its DOM elements
                        const newElements = f(key)
                        pauseTracking()
                        fragment.append(...newElements)
                        resetTracking()
                        newElementsCache.set(key, newElements)
                        newElementsForLogging.push(...newElements)
                    }
                    else { // Item is old; don't change it
                        // Put the item in the new cache
                        elementsCache.delete(key)
                        newElementsCache.set(key, existingElements)
                    }
                })

                // Log each new item that was added
                if (newElementsForLogging.length > 0) {
                    logChangeStart(el)
                    newElementsForLogging.forEach(logAdd)
                }

                // Remove the elements for the items which were removed
                if (elementsCache.size > 0) {
                    somethingChanged = true
                    logChangeStart(el)
                    elementsCache.forEach(oldElements => {
                        oldElements.forEach(remove)
                    })
                }
                
                if (!somethingChanged) {
                    console.log(items())
                    console.error("WARNING: the following element had a child update triggered, but the children didn't need to be updated:", el)
                    console.error("This element is erroneously reacting to a change in a piece of state that was accessed in the $for body.")
                }

                // Attach the new nodes
                pauseTracking()
                el.insertBefore(fragment, marker)
                resetTracking()
                elementsCache = newElementsCache
            })
        }
        // We have a non-reactive (static) child
        else {
            pauseTracking()
            el.appendChild(child)
            resetTracking()
        }
    })
}

// Create a HTML element with the given name and attributes. 
export function element<Keys extends keyof El, El extends StylelessElement>(
    name: string,
    attributes: AttributeSpec<Keys, El>,
    children: HTMLChildren,
): Effectful<El> {
    const el = document.createElement(name) as unknown as Effectful<El>
    el.$effects = []
    domUpdateJobs.set(el, new Set())

    // Ensure that DOM events trigger DOM updates after running
    for (const key in attributes) {
        if (eventHandlerNames.has(key)) {
            attributes[key] = defineDOMUpdate(attributes[key] as any) as any
        }
    }
    // Finish constructing the element
    assignReactiveAttributes(el, attributes)
    attachChildren(el, children)

    // If the element is not reactive, remove it from the list of elements that can update.
    // We needed to insert it immediately after creation to give it update priority.
    if (el.$effects.length === 0) {
        domUpdateJobs.delete(el)
    }
    return el
}

export function div<Keys extends keyof HTMLDivElement>(
    attributes: AttributeSpec<Keys, HTMLDivElement>,
    children: HTMLChildren = [],
): HTMLDivElement {
    return element("div", attributes, children)
}

export function br<Keys extends keyof HTMLBRElement>(
    attributes: AttributeSpec<Keys, HTMLBRElement> = {} as any,
): HTMLBRElement {
    return element("br", attributes, [])
}

export function h1<Keys extends keyof HTMLHeadingElement>(
    textContent: string | DerivedAttribute<string>,
    attributes: AttributeSpec<Keys, HTMLParagraphElement> = {} as any,
): HTMLParagraphElement {
    Object.assign(attributes, {textContent: textContent})
    return element("h1", attributes, [])
}

export function h2<Keys extends keyof HTMLHeadingElement>(
    textContent: string | DerivedAttribute<string>,
    attributes: AttributeSpec<Keys, HTMLParagraphElement> = {} as any,
): HTMLParagraphElement {
    Object.assign(attributes, {textContent: textContent})
    return element("h2", attributes, [])
}

export function h3<Keys extends keyof HTMLHeadingElement>(
    textContent: string | DerivedAttribute<string>,
    attributes: AttributeSpec<Keys, HTMLParagraphElement> = {} as any,
): HTMLParagraphElement {
    Object.assign(attributes, {textContent: textContent})
    return element("h3", attributes, [])
}

export function p<Keys extends keyof HTMLParagraphElement>(
    textContent: string | DerivedAttribute<string>,
    attributes: AttributeSpec<Keys, HTMLParagraphElement> = {} as any,
): HTMLParagraphElement {
    Object.assign(attributes, {textContent: textContent})
    return element("p", attributes, [])
}

export function span<Keys extends keyof HTMLParagraphElement>(
    textContent: string | DerivedAttribute<string>,
    attributes: AttributeSpec<Keys, HTMLParagraphElement> = {} as any,
): HTMLParagraphElement {
    Object.assign(attributes, {textContent: textContent})
    return element("span", attributes, [])
}

export function list<KeysL extends keyof HTMLOListElement, KeysI extends keyof HTMLLIElement>(
    listAttributes: AttributeSpec<KeysL, HTMLOListElement>,
    listItemAttributes: AttributeSpec<KeysI, HTMLLIElement>,
    items: StylelessElement[],
): HTMLOListElement {
    const htmlItems: StylelessElement[] = []
    items.forEach(item => htmlItems.push(element("li", listItemAttributes, [item])))
    return element("ol", listAttributes, htmlItems)
}

export function button<Keys extends keyof HTMLButtonElement>(
    textContent: string | DerivedAttribute<string>,
    attributes: AttributeSpec<Keys, HTMLButtonElement> = {} as any,
): HTMLButtonElement {
    Object.assign(attributes, {textContent: textContent})
    return element("button", attributes, [])
}

export function input<Keys extends keyof Styleless<HTMLInputElement>>(
    attributes: AttributeSpec<Keys, Styleless<HTMLInputElement>> = {} as any,
): Styleless<HTMLInputElement> { 
    const attrs = attributes as AttributeSpec<Keys | "value" | "oninput", HTMLInputElement>
    const valueRef: string | Ref<string> | DerivedAttribute<string> | undefined = attrs.value
    // If the "value" attribute exists and is a Ref, then set up two-way binding
    if (valueRef !== undefined && isRef(valueRef)) {
        const existingOnInput = attrs.oninput
        // If there is no existing oninput function
        if (existingOnInput === undefined || existingOnInput === null) {
            // On input, update the ref bound to "value"
            attrs.oninput = function (event: Event): any {
                valueRef.value = (event.target as HTMLInputElement).value
            }
        }
        else {
            // On input, update the ref bound to "value" and then call the existing oninput function
            attrs.oninput = function (event: Event): any {
                valueRef.value = (event.target as HTMLInputElement).value
                return existingOnInput.call(this, event)
            }
        }
    }

    return element("input", attributes, [])
}

export function textarea<Keys extends keyof HTMLTextAreaElement>(
    attributes: AttributeSpec<Keys, HTMLTextAreaElement> = {} as any,
): HTMLTextAreaElement {
    const attrs = attributes as AttributeSpec<Keys | "value" | "oninput", HTMLTextAreaElement>
    const valueRef: string | Ref<string> | DerivedAttribute<string> | undefined = attrs.value
    // If the "value" attribute exists and is a Ref, then set up two-way binding
    if (valueRef !== undefined && isRef(valueRef)) {
        const existingOnInput = attrs.oninput
        // If there is no existing oninput function
        if (existingOnInput === undefined || existingOnInput === null) {
            // On input, update the ref bound to "value"
            attrs.oninput = function (event: Event): any {
                valueRef.value = (event.target as HTMLInputElement).value
            }
        }
        else {
            // On input, update the ref bound to "value" and then call the existing oninput function
            attrs.oninput = function (event: Event): any {
                valueRef.value = (event.target as HTMLInputElement).value
                return existingOnInput.call(this, event)
            }
        }
    }

    return element("textarea", attributes, [])
}

export function img<Keys extends keyof HTMLParagraphElement>(
    source: string | DerivedAttribute<string>,
    attributes: AttributeSpec<Keys, HTMLParagraphElement> = {} as any,
): HTMLParagraphElement {
    Object.assign(attributes, {src: source})
    return element("img", attributes, [])
}
