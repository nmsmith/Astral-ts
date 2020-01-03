import { toRefs } from "@vue/reactivity"
import { $if, $for, div, input, span } from "../libs/lib-view"

interface SearchResult {
    readonly key: string
    readonly distance: number
}

export interface SearchBoxState {
    active: boolean
    text: string
    textChanged: boolean // whether text has been edited since last selecting search result
    kbSelectionCandidate: number
    mouseSelectionCandidate: number | null // needs to be null; undefined breaks toRefs() (see commit 6ed50a2)
    defaultSelection: number
    readonly results: SearchResult[]
}

export interface DefaultResultOption {
    optionText: string
    optionTextStyle: string
    inputTextStyle: string
}

export function searchBox(
    search: SearchBoxState,
    options: {
        borderAlwaysVisible?: boolean // default: true
        blurOnSelect?: boolean // default: true
        defaultResult?: DefaultResultOption
        inputTextStyle?: string
        onActive?: () => void
        onSelect?: (selection: number) => boolean // return whether the selection was accepted
        onNoSelection?: () => void
    }
): HTMLElement {
    if (options.borderAlwaysVisible === undefined) options.borderAlwaysVisible = true
    if (options.blurOnSelect === undefined) options.blurOnSelect = true
    function activeSelection(): number {
        if (search.mouseSelectionCandidate === null) {
            return search.kbSelectionCandidate
        }
        else {
            return search.mouseSelectionCandidate
        }
    }
    // Input text style customization as specified in options
    function currentInputTextStyle(): string {
        return (activeSelection() === -1
            ? options.defaultResult!.inputTextStyle as string
            : (options.inputTextStyle === undefined
                ? ""
                : options.inputTextStyle
            )   )
    }
    function offerSelection(selection: number): void {
        if (options.onSelect !== undefined) {
            if (options.onSelect(search.kbSelectionCandidate)) {
                if (selection >= 0) {
                    search.text = search.results[selection].key
                    // Since we've set the text to the key, it will become the first result
                    search.defaultSelection = 0
                }
                else {
                    search.defaultSelection = -1
                }
                search.textChanged = false
            }
        }
    }
    function defocusInput(): void {
        // Blur without calling the onblur event
        const f = inputEl.onblur
        inputEl.onblur = null
        inputEl.blur()
        inputEl.onblur = f
    }
    // The text of this input is hidden; it is displayed in a span instead.
    const inputEl = input ({
        class: () => "searchBoxInput " + currentInputTextStyle() + (
            options.borderAlwaysVisible === false && !search.active
                ? " searchBorderOnHover"
                : " searchBorder"
        ),
        autocomplete: "nope",
        value: toRefs(search).text,
        onkeydown: (event: KeyboardEvent) => {
            if (event.key === "ArrowDown") {
                if (search.mouseSelectionCandidate !== null) {
                    search.kbSelectionCandidate = search.mouseSelectionCandidate + 1
                    search.mouseSelectionCandidate = null
                }
                else {
                    ++search.kbSelectionCandidate
                }
                if (search.kbSelectionCandidate >= search.results.length) {
                    search.kbSelectionCandidate = search.results.length - 1
                }
                event.preventDefault() // don't move the cursor to end of input
            }
            else if (event.key === "ArrowUp") {
                if (search.mouseSelectionCandidate !== null) {
                    search.kbSelectionCandidate = search.mouseSelectionCandidate - 1
                    search.mouseSelectionCandidate = null
                }
                else {
                    --search.kbSelectionCandidate
                }
                const minValue = options.defaultResult === undefined ? 0 : -1
                if (search.kbSelectionCandidate < minValue) {
                    search.kbSelectionCandidate = minValue
                }
                event.preventDefault() // don't move the cursor to start of input
            }
            // Select and defocus
            else if (event.key === "Enter") {
                offerSelection(search.kbSelectionCandidate)
                if (options.blurOnSelect === true) {
                    search.active = false
                    defocusInput()
                }
            }
            // Consider tab-navigation to be selection
            else if (event.key === "Tab") {
                offerSelection(search.kbSelectionCandidate)
                search.active = false
                defocusInput()
            }
        },
        oninput: () => {
            search.textChanged = true
            search.kbSelectionCandidate = search.results.length === 0 || search.results[0].distance > 0
                ? -1
                : 0
            search.mouseSelectionCandidate = null
        },
        onfocus: () => {
            search.active = true
            search.kbSelectionCandidate = search.defaultSelection
            search.mouseSelectionCandidate = null
            if (options.onActive !== undefined) options.onActive()
        },
        onblur: () => {    
            // Check if the search is active, and therefore we need to clean up
            if (search.active === true) {
                if (search.textChanged) {
                    if (options.onNoSelection !== undefined) options.onNoSelection()
                    search.textChanged = false
                    search.defaultSelection = options.defaultResult === undefined ? 0 : -1
                }
                search.kbSelectionCandidate = search.defaultSelection
                search.mouseSelectionCandidate = null
                search.active = false
            }
        },
    })
    return div ({class: "searchBox"}, [
        div ({class: () => "searchBoxInputContext"}, [
            inputEl,
            // This span determines the input el's width
            span (() => (search.text.length > 0) ? search.text : "   ", {
                class: () => "searchBoxTextSizeMeasure " + currentInputTextStyle(),
            }),
        ]),
        div ({class: "searchResultsLocation"}, [ // searchResults div is positioned relative to here
            $if (() => search.active && (search.results.length > 0 || options.defaultResult !== undefined), {
                $then: () => {
                    const resultEl = (text: string, textClass: string, index: () => number): HTMLElement =>
                        div ({
                            class:
                                $if (() => activeSelection() === index(), {
                                    $then: () => "searchResult highlighted",
                                    $else: () => "searchResult",
                                }),
                            onmouseenter: () => search.mouseSelectionCandidate = index(),
                            onclick: () => {
                                const i = index()
                                search.kbSelectionCandidate = i
                                search.mouseSelectionCandidate = i
                                offerSelection(i)
                                if (options.blurOnSelect === true) {
                                    search.active = false
                                    defocusInput()
                                }
                            },
                        }, [
                            span (() => text, {class: "noWrap " + textClass}),
                        ])
                    return [
                        div ({
                            class: "searchResults",
                            // Prevent the "blur" event from occurring when the dropdown is clicked
                            onmousedown: event => event.preventDefault(),
                        }, [
                            $if (() => options.defaultResult !== undefined, {
                                $then: () => [resultEl(
                                    (options.defaultResult as DefaultResultOption).optionText as string,
                                    (options.defaultResult as DefaultResultOption).optionTextStyle as string,
                                    () => -1,
                                )],
                                $else: () => [],
                            }),
                            $for (() => search.results, result => [
                                resultEl(result.key, "", () => result.$index),
                            ]),
                        ]),
                    ]
                },
                $else: () => [],
            }),

        ]),
    ])
}