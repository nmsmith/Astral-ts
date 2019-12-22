<template lang="pug">

</template>

<script lang="ts">
import {createComponent, ref, reactive, toRefs, computed, Ref} from "@vue/composition-api"
import * as IDRegistry from "./id-registry"

export default createComponent({
    setup(props: IDRegistry.T) {
        const element: Ref<HTMLInputElement | undefined> = ref(undefined)
        const text: Ref<string> = ref("")

        const searchMatches = computed(() => {
            const errorTolerance = (text.value.length <= 1) ? 0 : 1
            const searchResults = IDRegistry.getMatchesForPrefix(props.subjectRegistry, text, errorTolerance)
            searchResults.sort((a, b) => a.distance - b.distance)
            return searchResults
        })

        return {
            derived: {
                allSubjects:
                    computed((): IDRegistry.SearchResult[] => {
                        return IDRegistry.getMatchesForPrefix(subjectRegistry, "", 0)
                    }),
                textForSearchMatches:
                    computed((): string[] => {
                        return searchMatches.value.map(match => `${match.key} [${match.val}]`)
                    }),
            },
            focusSubjectInput(): void {
                if (subjectInput.value !== undefined) {
                    subjectInput.value.focus()
                }
            },
            selectPrevious(): void {
                if (state.subjectInputState.selection > 0) {
                    --state.subjectInputState.selection
                }
            },
            selectNext(): void {
                if (state.subjectInputState.selection < searchMatches.value.length - 1) {
                    ++state.subjectInputState.selection
                }
            },
            createSubject(): void {
                if (state.subjectInputState.text.length > 0) {
                    IDRegistry.newID(state.subjectRegistry, state.subjectInputState.text)
                    state.subjectInputState.text = ""
                    state.subjectInputState.selection = 0
                }
            },
        }
    },
})
</script>