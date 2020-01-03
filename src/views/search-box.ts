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
    selectionCandidate: number
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
        onSelect?: () => void
        onNoSelection?: () => void
    }
): HTMLElement {
    if (options.borderAlwaysVisible === undefined) options.borderAlwaysVisible = true
    if (options.blurOnSelect === undefined) options.blurOnSelect = true
    // Input text style customization as specified in options
    function currentInputTextStyle(): string {
        return (search.selectionCandidate === -1
            ? options.defaultResult!.inputTextStyle as string
            : (options.inputTextStyle === undefined
                ? ""
                : options.inputTextStyle
            )   )
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
                if (search.selectionCandidate < search.results.length - 1) {
                    ++search.selectionCandidate
                }
                event.preventDefault() // don't move the cursor to end of input
            }
            else if (event.key === "ArrowUp") {
                if (search.selectionCandidate >= (options.defaultResult === undefined ? 1 : 0)) {
                    --search.selectionCandidate
                }
                event.preventDefault() // don't move the cursor to start of input
            }
            else if (event.key === "Enter") {
                if (options.onSelect !== undefined) {
                    options.onSelect()
                }
                if (options.blurOnSelect === true) {
                    search.active = false
                    inputEl.blur()
                }
            }
        },
        oninput: () => {
            search.textChanged = true
            search.selectionCandidate = search.results.length === 0 || search.results[0].distance > 0
                ? -1
                : 0
        },
        onfocus: () => {
            search.active = true
            search.selectionCandidate = search.results.length === 0 || search.results[0].distance > 0
                ? -1
                : 0
            if (options.onActive !== undefined) options.onActive()
        },
        onblur: () => {
            // Check if the search is active, and therefore we need to clean up
            if (search.active === true) {
                if (options.onNoSelection !== undefined) options.onNoSelection()
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
                                $if (() => search.selectionCandidate === index(), {
                                    $then: () => "searchResult highlighted",
                                    $else: () => "searchResult",
                                }),
                            onmouseenter: () => search.selectionCandidate = index(),
                            onclick: () => {
                                if (options.onSelect !== undefined) {
                                    options.onSelect()
                                }
                                if (options.blurOnSelect === true) {
                                    search.active = false
                                    inputEl.blur()
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