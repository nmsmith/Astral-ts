import * as FuzzyDict from "./fuzzy-prefix-dict"

export interface Type<Value> {
    lastID: Value
    namesDict: FuzzyDict.FuzzyDict<Value>
}

export function empty(): Type<number> {
    return {
        lastID: 0,
        namesDict: FuzzyDict.empty()
    }
}

export function newID(registry: Type<number>, label?: string): number {
    let id = ++registry.lastID
    if (label !== undefined) {
        FuzzyDict.insert(registry.namesDict, label, id)
    }
    return id
}

export function getID(registry: Type<number>, label: string): number | undefined {
    let firstResult = undefined
    FuzzyDict.fuzzySearch(registry.namesDict, label).some(result => {
        if (result.distance === 0) {
            firstResult = result.value
            return true
        }
    })
    return firstResult
}

export function getLabel(registry: Type<number>, id: number): string {
    return "Unimplemented. " + id
}

export function relabelID(registry: Type<number>, id: number, label: string): void {
    FuzzyDict.insert(registry.namesDict, label, id)
}