import { toRefs } from "@vue/reactivity"
import { div, input, span } from "../libs/lib-view"

export interface TextBoxState {
    focused: boolean
    text: string
    readonly textIsValid: boolean
}

export function textBox(
    state: TextBoxState,
    options: {
        borderAlwaysVisible?: boolean // default: true
        inputTextStyle?: string
        invalidInputTextStyle?: string
        onSubmit?: () => void
        onKeyDown?: (key: string, input: HTMLInputElement) => boolean // returns whether to blur the box
    },
): HTMLElement {
    // Fill in missing options
    const borderAlwaysVisible = options.borderAlwaysVisible !== false
    const inputTextStyle = (options.inputTextStyle === undefined) ? "" : options.inputTextStyle
    const invalidInputTextStyle = (options.invalidInputTextStyle === undefined) ? "" : options.invalidInputTextStyle
    
    // Input text style customization as specified in options
    function currentInputTextStyle(): string {
        return state.textIsValid ? inputTextStyle : invalidInputTextStyle
    }
    function defocusInput(): void {
        /* eslint-disable @typescript-eslint/no-use-before-define */
        // Blur without calling the onblur event
        const f = inputEl.onblur
        inputEl.onblur = null
        inputEl.blur()
        inputEl.onblur = f
    }
    // The text of this input is hidden; it is displayed in a span instead.
    const inputEl = input ({
        class: () => "textBoxInput " + currentInputTextStyle() + (
            borderAlwaysVisible === true || state.focused
                ? " textBoxBorder"
                : " textBoxBorderOnHover" // this will apply a border to the span, not me
        ),
        autocomplete: "nope",
        autocapitalize: "off",
        value: toRefs(state).text,
        onkeydown: (event: KeyboardEvent) => {
            if (event.key === "Enter" || event.key === "Tab") {
                options.onSubmit?.()
                defocusInput()
                state.focused = false
            }
            else if (options.onKeyDown !== undefined) {
                if (options.onKeyDown(event.key, event.target as HTMLInputElement)) {
                    defocusInput()
                }
            }
        },
        onfocus: () => {
            state.focused = true
        },
        onblur: () => {
            if (state.focused) {
                options.onSubmit?.()
                state.focused = false
            }
        },
    })
    return div ({class: () => "textBoxInputContext"}, [
        inputEl,
        // This span determines the input el's width
        span (() => (state.text.length > 0) ? state.text : " ", {
            class: () => "textBoxTextSizeMeasure " + currentInputTextStyle(),
        }),
    ])
}