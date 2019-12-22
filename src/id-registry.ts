import * as FuzzyDict from "./fuzzy-prefix-dict"

export type ID = number

interface IDRegistry {
    lastID: ID
    namesDict: FuzzyDict.T<ID>
}

export type T = IDRegistry

export function empty(): IDRegistry {
    return {
        lastID: 0,
        namesDict: FuzzyDict.empty()
    }
}

export function newID(registry: IDRegistry, label?: string): ID {
    let id = ++registry.lastID
    if (label !== undefined) {
        FuzzyDict.insert(registry.namesDict, label, id)
    }
    return id
}

export function getID(registry: IDRegistry, label: string): ID | undefined {
    let firstResult = undefined
    FuzzyDict.fuzzySearch(registry.namesDict, label, 0).some(result => {
        if (result.key === label) {
            firstResult = result.val
            return true
        }
    })
    return firstResult
}

export type SearchResult = FuzzyDict.SearchResult<ID>

export function getMatchesForPrefix(registry: IDRegistry, label: string, errorTolerance: number): SearchResult[] {
    return FuzzyDict.fuzzySearch(registry.namesDict, label, errorTolerance)
}

export function getLabel(registry: IDRegistry, id: ID): string {
    return "Unimplemented. " + id
}

export function relabelID(registry: IDRegistry, id: ID, label: string): void {
    FuzzyDict.insert(registry.namesDict, label, id)
}